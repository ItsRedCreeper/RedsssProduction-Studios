declare module "gifsicle-wasm-browser" {
  type GifInput = {
    file: File | Blob | ArrayBuffer | string;
    name: string;
  };

  type GifSicle = {
    run: (opts: {
      input: GifInput[];
      command: string[];
      folder?: string[];
      isStrict?: boolean;
    }) => Promise<Array<File | { file: Uint8Array; name: string }>>;
  };

  const gifsicle: GifSicle;
  export default gifsicle;
}
