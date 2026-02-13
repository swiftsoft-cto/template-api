/**
 * Declaração de tipos para music-metadata (pacote ESM).
 * O pacote expõe parseBuffer em core; o default export é usado em import().
 */
declare module 'music-metadata' {
  export interface IFileInfo {
    mimeType?: string;
    size?: number;
    path?: string;
  }

  export interface IOptions {
    duration?: boolean;
  }

  export interface IAudioMetadata {
    format?: {
      duration?: number;
    };
  }

  export function parseBuffer(
    uint8Array: Uint8Array,
    fileInfo?: IFileInfo | string,
    options?: IOptions,
  ): Promise<IAudioMetadata>;
}
