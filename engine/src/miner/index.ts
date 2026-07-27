import { config, type MinerSource } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { filterNewOffers, insertOffers, type OfferRow } from '../database/offers.js';
import { mockMiner } from './mock.js';
import { shopeeMiner } from './shopee.js';
import type { Miner, MinedOffer, MinerOptions } from './types.js';

const MINERS: Record<MinerSource, Miner> = {
  mock: mockMiner,
  shopee: shopeeMiner,
};

export function getMiner(source: MinerSource = config.miner.source): Miner {
  const miner = MINERS[source];
  if (!miner) throw new Error(`Fonte de mineração desconhecida: ${source}`);
  return miner;
}

export interface MineResult {
  /** Tudo que a fonte devolveu. */
  mined: MinedOffer[];
  /** O que ainda não existia no banco e foi gravado. */
  inserted: OfferRow[];
  /** Quantas ofertas foram descartadas por já estarem registradas. */
  duplicates: number;
}

/**
 * Executa a mineração e persiste apenas o que é inédito.
 * Este é o ponto de entrada usado pelo orquestrador.
 */
export async function mineAndStore(options: MinerOptions = {}): Promise<MineResult> {
  const miner = getMiner();
  const opts: MinerOptions = {
    keywords: options.keywords ?? config.miner.keywords,
    limit: options.limit ?? config.miner.limit,
    minDiscount: options.minDiscount ?? config.miner.minDiscount,
  };

  logger.info(`Minerando ofertas via "${miner.name}" (limite ${opts.limit}, desconto ≥ ${opts.minDiscount}%)`);
  const mined = await miner.mine(opts);

  const fresh = filterNewOffers(mined);
  const inserted = insertOffers(fresh);

  logger.success(
    `Mineração concluída: ${mined.length} encontradas, ${inserted.length} novas, ${mined.length - inserted.length} já conhecidas`,
  );

  return { mined, inserted, duplicates: mined.length - inserted.length };
}

export { mockMiner, shopeeMiner };
export type { Miner, MinedOffer, MinerOptions };
