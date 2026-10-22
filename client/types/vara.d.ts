// Vara.js ships no types; only what components/court/signature.tsx uses.
declare module "vara" {
  type VaraText = {
    id: string;
    text: string;
    fontSize?: number;
    strokeWidth?: number;
    color?: string;
    duration?: number;
    textAlign?: "left" | "center" | "right";
    autoAnimation?: boolean;
    letterSpacing?: number;
  };
  export default class Vara {
    constructor(selector: string, fontUrl: string, texts: VaraText[], options?: Partial<VaraText>);
    ready(cb: () => void): void;
    draw(id: string, duration?: number): void;
  }
}
