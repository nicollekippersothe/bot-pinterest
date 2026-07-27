export type Platform = 'shopee' | 'amazon';

/** Oferta normalizada — contrato único entre qualquer minerador e o resto do pipeline. */
export interface MinedOffer {
  /** Chave estável de deduplicação (`plataforma:shopid.itemid`). */
  productKey: string;
  platform: Platform;
  title: string;
  /** URL pública do produto, sem parâmetros de afiliado. */
  originalUrl: string;
  /** URL já monetizada, usada nos posts. */
  affiliateUrl: string;
  /** Imagem principal em alta resolução. */
  imageUrl: string | null;
  /** Preço com desconto, em BRL. */
  price: number;
  /** Preço cheio, quando conhecido. */
  originalPrice?: number | null;
  /** Desconto em % (inteiro). */
  discount?: number;
  rating?: number | null;
  sold?: number | null;
  category?: string | null;
}

export interface MinerOptions {
  keywords?: string[];
  limit?: number;
  /** Descarta ofertas abaixo deste desconto (%). */
  minDiscount?: number;
}

export interface Miner {
  readonly name: string;
  mine(options?: MinerOptions): Promise<MinedOffer[]>;
}

/** Calcula o desconto em % a partir do par (preço cheio, preço atual). */
export function calcDiscount(originalPrice: number | null | undefined, price: number): number {
  if (!originalPrice || originalPrice <= 0 || price >= originalPrice) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}
