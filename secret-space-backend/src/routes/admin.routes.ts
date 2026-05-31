import { Router, Request, Response } from 'express';
import { verifyJWT } from '../middlewares/auth';
import { getHumanizeStats } from '../services/humanize';

/**
 * Admin / observability routes — no separate role gating yet because this is
 * a private two-user app, but the authenticated JWT middleware ensures only
 * a signed-in account can read these metrics. If we ever onboard more users
 * we should narrow this to a known admin user id (env-configured) before
 * widening distribution.
 */
const router = Router();

router.use(verifyJWT);

// GET /api/admin/humanize-stats
// Returns the in-memory counters from services/humanize. Counters reset on
// every server restart, so the numbers reflect "since last deploy" — useful
// for spot-checking that the pipeline is behaving as expected after a tuning
// change. For longer-running aggregation, query the structured log lines
// emitted by the humanizer (search for "[humanize]").
router.get('/humanize-stats', (_req: Request, res: Response) => {
  res.json(getHumanizeStats());
});

export default router;
