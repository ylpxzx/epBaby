import type { DesktopPetApi } from "../shared/contracts";

declare global {
  interface Window {
    desktopPet: DesktopPetApi;
  }
}

export {};
