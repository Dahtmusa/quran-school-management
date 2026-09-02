declare module 'qrcode' {
  const QRCode: {
    toDataURL: (text: string, options?: any) => Promise<string>;
  };
  export default QRCode;
}

declare module 'jsbarcode' {
  const JsBarcode: (element: any, text: string, options?: any) => any;
  export default JsBarcode;
}
