param(
  [string]$SourceRoot = (Join-Path $PSScriptRoot "..\baby"),
  [string]$OutputRoot = (Join-Path $PSScriptRoot "..\baby\frames")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not ("EpBaby.SpriteSlicer" -as [type])) {
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

namespace EpBaby
{
    public static class SpriteSlicer
    {
        private const int Columns = 6;
        private const int CellInset = 2;

        public static int SliceAll(string sourceRoot, string outputRoot)
        {
            sourceRoot = Path.GetFullPath(sourceRoot);
            outputRoot = Path.GetFullPath(outputRoot);
            Directory.CreateDirectory(outputRoot);
            int written = 0;

            foreach (string filePath in Directory.GetFiles(sourceRoot, "*.png", SearchOption.AllDirectories))
            {
                string fullPath = Path.GetFullPath(filePath);
                if (fullPath.StartsWith(outputRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                    continue;

                bool isRunSheet = Path.GetFileNameWithoutExtension(filePath).EndsWith("-run-6f", StringComparison.OrdinalIgnoreCase);
                int rows = isRunSheet ? 1 : 5;
                written += SliceSheet(fullPath, outputRoot, rows, Columns);
            }

            return written;
        }

        private static int SliceSheet(string filePath, string outputRoot, int rows, int columns)
        {
            string sheetName = Path.GetFileNameWithoutExtension(filePath);
            string sheetOutput = Path.Combine(outputRoot, sheetName);
            int count = 0;

            using (Bitmap original = new Bitmap(filePath))
            using (Bitmap source = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb))
            {
                using (Graphics graphics = Graphics.FromImage(source))
                {
                    graphics.Clear(Color.Transparent);
                    graphics.DrawImageUnscaled(original, 0, 0);
                }

                RemoveConnectedBackground(source);

                for (int row = 0; row < rows; row++)
                {
                    string actionDirectory = Path.Combine(sheetOutput, "action-" + (row + 1).ToString("00"));
                    Directory.CreateDirectory(actionDirectory);

                    for (int column = 0; column < columns; column++)
                    {
                        int left = (int)Math.Round((double)(column * source.Width) / columns);
                        int right = (int)Math.Round((double)((column + 1) * source.Width) / columns);
                        int top = (int)Math.Round((double)(row * source.Height) / rows);
                        int bottom = (int)Math.Round((double)((row + 1) * source.Height) / rows);
                        Rectangle frameBounds = new Rectangle(
                            left + CellInset,
                            top + CellInset,
                            Math.Max(1, right - left - CellInset * 2),
                            Math.Max(1, bottom - top - CellInset * 2)
                        );

                        using (Bitmap frame = source.Clone(frameBounds, PixelFormat.Format32bppArgb))
                        {
                            RemoveSmallBorderComponents(frame);
                            string outputPath = Path.Combine(actionDirectory, "frame-" + (column + 1).ToString("00") + ".png");
                            frame.Save(outputPath, ImageFormat.Png);
                            count++;
                        }
                    }
                }
            }

            Console.WriteLine(sheetName + ": " + count + " frames");
            return count;
        }

        private static void RemoveConnectedBackground(Bitmap bitmap)
        {
            Rectangle bounds = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
            BitmapData data = bitmap.LockBits(bounds, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            try
            {
                int stride = Math.Abs(data.Stride);
                byte[] pixels = new byte[stride * bitmap.Height];
                Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
                int total = bitmap.Width * bitmap.Height;
                byte[] visited = new byte[total];
                int[] queue = new int[total];
                int read = 0;
                int write = 0;

                long blueTotal = 0;
                long greenTotal = 0;
                long redTotal = 0;
                int borderCount = 0;
                Action<int, int> sample = (x, y) =>
                {
                    int offset = y * stride + x * 4;
                    blueTotal += pixels[offset];
                    greenTotal += pixels[offset + 1];
                    redTotal += pixels[offset + 2];
                    borderCount++;
                };

                for (int x = 0; x < bitmap.Width; x++)
                {
                    sample(x, 0);
                    sample(x, bitmap.Height - 1);
                }
                for (int y = 1; y < bitmap.Height - 1; y++)
                {
                    sample(0, y);
                    sample(bitmap.Width - 1, y);
                }

                int backgroundBlue = (int)(blueTotal / borderCount);
                int backgroundGreen = (int)(greenTotal / borderCount);
                int backgroundRed = (int)(redTotal / borderCount);

                Action<int> enqueue = index =>
                {
                    if (visited[index] != 0) return;
                    visited[index] = 1;
                    queue[write++] = index;
                };

                for (int x = 0; x < bitmap.Width; x++)
                {
                    enqueue(x);
                    enqueue((bitmap.Height - 1) * bitmap.Width + x);
                }
                for (int y = 1; y < bitmap.Height - 1; y++)
                {
                    enqueue(y * bitmap.Width);
                    enqueue(y * bitmap.Width + bitmap.Width - 1);
                }

                while (read < write)
                {
                    int current = queue[read++];
                    int x = current % bitmap.Width;
                    int y = current / bitmap.Width;
                    if (x > 0) TryVisit(current, current - 1, bitmap.Width, stride, pixels, visited, queue, ref write, backgroundBlue, backgroundGreen, backgroundRed);
                    if (x + 1 < bitmap.Width) TryVisit(current, current + 1, bitmap.Width, stride, pixels, visited, queue, ref write, backgroundBlue, backgroundGreen, backgroundRed);
                    if (y > 0) TryVisit(current, current - bitmap.Width, bitmap.Width, stride, pixels, visited, queue, ref write, backgroundBlue, backgroundGreen, backgroundRed);
                    if (y + 1 < bitmap.Height) TryVisit(current, current + bitmap.Width, bitmap.Width, stride, pixels, visited, queue, ref write, backgroundBlue, backgroundGreen, backgroundRed);
                }

                for (int index = 0; index < total; index++)
                {
                    if (visited[index] == 0) continue;
                    int x = index % bitmap.Width;
                    int y = index / bitmap.Width;
                    pixels[y * stride + x * 4 + 3] = 0;
                }

                Marshal.Copy(pixels, 0, data.Scan0, pixels.Length);
            }
            finally
            {
                bitmap.UnlockBits(data);
            }
        }

        private static void TryVisit(
            int current,
            int next,
            int width,
            int stride,
            byte[] pixels,
            byte[] visited,
            int[] queue,
            ref int write,
            int backgroundBlue,
            int backgroundGreen,
            int backgroundRed)
        {
            if (visited[next] != 0) return;
            int currentX = current % width;
            int currentY = current / width;
            int nextX = next % width;
            int nextY = next / width;
            int currentOffset = currentY * stride + currentX * 4;
            int nextOffset = nextY * stride + nextX * 4;
            int db = pixels[currentOffset] - pixels[nextOffset];
            int dg = pixels[currentOffset + 1] - pixels[nextOffset + 1];
            int dr = pixels[currentOffset + 2] - pixels[nextOffset + 2];
            if (db * db + dg * dg + dr * dr > 225) return;
            if (Math.Abs(pixels[nextOffset] - backgroundBlue) > 58) return;
            if (Math.Abs(pixels[nextOffset + 1] - backgroundGreen) > 58) return;
            if (Math.Abs(pixels[nextOffset + 2] - backgroundRed) > 58) return;
            visited[next] = 1;
            queue[write++] = next;
        }

        private static void RemoveSmallBorderComponents(Bitmap bitmap)
        {
            Rectangle bounds = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
            BitmapData data = bitmap.LockBits(bounds, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            try
            {
                int stride = Math.Abs(data.Stride);
                byte[] pixels = new byte[stride * bitmap.Height];
                Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
                int total = bitmap.Width * bitmap.Height;
                byte[] visited = new byte[total];
                const int edgeBand = 4;
                int largestArea = 0;
                List<List<int>> edgeComponents = new List<List<int>>();

                for (int start = 0; start < total; start++)
                {
                    if (visited[start] != 0) continue;
                    visited[start] = 1;
                    int startX = start % bitmap.Width;
                    int startY = start / bitmap.Width;
                    if (pixels[startY * stride + startX * 4 + 3] == 0) continue;

                    Queue<int> queue = new Queue<int>();
                    List<int> component = new List<int>();
                    bool touchesEdge = false;
                    queue.Enqueue(start);

                    while (queue.Count > 0)
                    {
                        int current = queue.Dequeue();
                        component.Add(current);
                        int x = current % bitmap.Width;
                        int y = current / bitmap.Width;
                        if (x < edgeBand || x >= bitmap.Width - edgeBand || y < edgeBand || y >= bitmap.Height - edgeBand)
                            touchesEdge = true;

                        if (x > 0) EnqueueComponentPixel(current - 1, bitmap.Width, stride, pixels, visited, queue);
                        if (x + 1 < bitmap.Width) EnqueueComponentPixel(current + 1, bitmap.Width, stride, pixels, visited, queue);
                        if (y > 0) EnqueueComponentPixel(current - bitmap.Width, bitmap.Width, stride, pixels, visited, queue);
                        if (y + 1 < bitmap.Height) EnqueueComponentPixel(current + bitmap.Width, bitmap.Width, stride, pixels, visited, queue);
                    }

                    largestArea = Math.Max(largestArea, component.Count);
                    if (touchesEdge) edgeComponents.Add(component);
                }

                foreach (List<int> component in edgeComponents)
                {
                    if (component.Count >= largestArea) continue;
                    foreach (int index in component)
                    {
                        int x = index % bitmap.Width;
                        int y = index / bitmap.Width;
                        pixels[y * stride + x * 4 + 3] = 0;
                    }
                }

                Marshal.Copy(pixels, 0, data.Scan0, pixels.Length);
            }
            finally
            {
                bitmap.UnlockBits(data);
            }
        }

        private static void EnqueueComponentPixel(
            int index,
            int width,
            int stride,
            byte[] pixels,
            byte[] visited,
            Queue<int> queue)
        {
            if (visited[index] != 0) return;
            visited[index] = 1;
            int x = index % width;
            int y = index / width;
            if (pixels[y * stride + x * 4 + 3] == 0) return;
            queue.Enqueue(index);
        }
    }
}
"@
}

$source = [System.IO.Path]::GetFullPath($SourceRoot)
$output = [System.IO.Path]::GetFullPath($OutputRoot)
$frameCount = [EpBaby.SpriteSlicer]::SliceAll($source, $output)
Write-Output "Generated $frameCount single-frame PNG files in $output"
