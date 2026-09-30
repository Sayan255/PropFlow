import { Op } from 'sequelize';
import { maskPhone } from '@propflow/shared';

/** Builds an OR clause over searchable text columns; masks phones inside the LIKE when needed. */
export function buildFreeTextClause(term) {
  const like = `%${term.replace(/[%_]/g, '')}%`;
  const masked = maskPhone(term.replace(/\D/g, ''));
  const or = [
    { title: { [Op.like]: like } },
    { buildingName: { [Op.like]: like } },
    { unitNo: { [Op.like]: like } },
    { locality: { [Op.like]: like } },
    { ownerName: { [Op.like]: like } },
    { ownerPhone: { [Op.like]: like } },
  ];
  if (masked && masked !== term) {
    or.push({ ownerPhone: { [Op.like]: masked.replace(' •••', '%') } });
  }
  return { [Op.or]: or };
}
