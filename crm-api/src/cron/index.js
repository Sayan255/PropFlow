import cron from 'node-cron';
import { Op } from 'sequelize';
import config from '../config.js';
import { logger } from '../logger.js';
import { SiteVisit } from '../models.js';
import { acquireLock } from '../redis.js';
import { emitVisitReminder } from '../realtime/emit.js';

/** Every minute: remind visits starting within 15 min that haven't been reminded. */
export function startReminderJob() {
  cron.schedule(config.cron.reminderCron, async () => {
    const release = await acquireLock('visit-reminder', config.cron.reminderLockSeconds);
    if (!release) return; // another instance won the race
    const now = Date.now();
    const windowEnd = new Date(now + config.cron.reminderWindowMinutes * 60_000);
    try {
      const due = await SiteVisit.findAll({
        where: { outcome: 'Scheduled', remindedAt: null, visitAtUtc: { [Op.lte]: windowEnd, [Op.gte]: new Date(now - 60_000) } },
      });
      for (const visit of due) {
        visit.remindedAt = new Date();
        await visit.save();
        emitVisitReminder([visit.agentId], {
          visitId: String(visit.id),
          propertyId: String(visit.propertyId),
          visitAtUtc: visit.visitAtUtc,
        });
        logger.info({ visitId: visit.id, requestId: `cron:${Date.now()}` }, 'visit reminder sent');
      }
    } catch (err) {
      logger.error({ err }, 'reminder job failed');
    } finally {
      await release();
    }
  });
  logger.info({ cron: config.cron.reminderCron }, 'reminder job scheduled');
}

/** 02:00 IST nightly: mark listings with no activity for 30 days as stale. */
export function startStaleJob() {
  cron.schedule(config.cron.staleCron, async () => {
    const release = await acquireLock('stale-marking', 300);
    if (!release) return;
    try {
      const cutoff = new Date(Date.now() - config.cron.staleDays * 24 * 3600 * 1000);
      const [affected] = await (await import('../models.js')).Property.update(
        { isStale: true },
        { where: { isStale: false, deletedAt: null, updatedAt: { [Op.lt]: cutoff } }, limit: 5000 },
      );
      logger.info({ affected }, 'stale marking complete');
    } catch (err) {
      logger.error({ err }, 'stale job failed');
    } finally {
      await release();
    }
  });
  logger.info({ cron: config.cron.staleCron }, 'stale job scheduled (02:00 IST)');
}
