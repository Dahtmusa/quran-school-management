declare module 'qrcode' {
  const QRCode: {
    toDataURL: (text: string, options?: any) => Promise<string>;
    create: (text: string, options?: any) => { modules: { size: number; get: (row: number, col: number) => number | boolean } };
  };
  export default QRCode;
}

declare module 'jsbarcode' {
  const JsBarcode: (element: any, text: string, options?: any) => any;
  export default JsBarcode;
}
