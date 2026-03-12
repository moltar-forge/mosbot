const logger = require('../utils/logger');
const { recordActivityLogEventSafe } = require('../services/activityLogService');
const {
  getCronJobsData,
  getCronJobStatsData,
  getCronJobRunsData,
} = require('../services/cronJobService');

function registerOpenClawCronRoutes({ router, requireAuth, requireAdmin }) {
  router.get('/cron-jobs', requireAuth, async (req, res, next) => {
    try {
      const data = await getCronJobsData({ userId: req.user.id });
      res.json({ data });
    } catch (error) {
      if (error.code === 'SERVICE_NOT_CONFIGURED' || error.code === 'SERVICE_UNAVAILABLE') {
        logger.warn('OpenClaw not available for cron jobs, returning empty array', {
          userId: req.user.id,
        });
        return res.json({ data: [] });
      }
      next(error);
    }
  });

  router.get('/cron-jobs/stats', requireAuth, async (req, res, next) => {
    try {
      const data = await getCronJobStatsData({ userId: req.user.id });
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.get('/cron-jobs/:jobId/runs', requireAuth, async (req, res, next) => {
    try {
      const data = await getCronJobRunsData({
        userId: req.user.id,
        jobId: req.params.jobId,
        limit: req.query.limit,
      });
      res.json(data);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: { message: error.message, status: error.status } });
      }
      next(error);
    }
  });

  router.get('/cron-jobs/:jobId', requireAuth, async (req, res, next) => {
    try {
      const { readCronJobs, fromOfficialFormat } = require('../services/cronJobsService');
      const { jobId } = req.params;

      logger.info('Fetching single cron job', { userId: req.user.id, jobId });

      const jobs = await readCronJobs();

      if (!jobs[jobId]) {
        return res.status(404).json({
          error: { message: `Cron job not found: ${jobId}`, status: 404 },
        });
      }

      res.json({ data: fromOfficialFormat(jobs[jobId]) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/cron-jobs', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { createCronJob } = require('../services/cronJobsService');
      const {
        jobId: _jobId,
        id: _id,
        createdAtMs: _createdAtMs,
        updatedAtMs: _updatedAtMs,
        state: _state,
        ...bodyWithoutSystemFields
      } = req.body;

      logger.info('Creating cron job', {
        userId: req.user.id,
        name: bodyWithoutSystemFields.name,
      });

      const job = await createCronJob(bodyWithoutSystemFields);

      recordActivityLogEventSafe({
        event_type: 'cron_job_created',
        source: 'cron',
        title: `Cron job created: ${job.name || job.jobId}`,
        description: `New cron job "${job.name}" created with schedule "${job.schedule}"`,
        severity: 'info',
        actor_user_id: req.user.id,
        job_id: job.jobId,
        meta: { name: job.name, schedule: job.schedule, agentId: job.agentId },
      });

      res.status(201).json({ data: job });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/cron-jobs/:jobId', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { updateCronJob, updateHeartbeatJob } = require('../services/cronJobsService');
      const { jobId } = req.params;

      logger.info('Updating cron job', {
        userId: req.user.id,
        jobId,
        name: req.body.name,
      });

      const isHeartbeat = jobId.startsWith('heartbeat-');
      let job;
      if (isHeartbeat) {
        job = await updateHeartbeatJob(jobId, req.body);
      } else {
        job = await updateCronJob(jobId, req.body);
      }

      recordActivityLogEventSafe({
        event_type: 'cron_job_updated',
        source: 'cron',
        title: `Cron job updated: ${jobId}`,
        description: `Cron job "${jobId}" configuration updated`,
        severity: 'info',
        actor_user_id: req.user.id,
        job_id: jobId,
        meta: { changes: req.body, isHeartbeat },
      });

      res.json({ data: job });
    } catch (error) {
      next(error);
    }
  });

  router.post('/cron-jobs/repair', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { repairCronJobs } = require('../services/cronJobsService');

      logger.info('Attempting jobs.json repair', { userId: req.user.id });

      const result = await repairCronJobs();

      logger.info('jobs.json repair complete', {
        userId: req.user.id,
        recovered: result.recovered,
        lost: result.lost,
      });

      res.json({
        data: {
          recovered: result.recovered,
          lost: result.lost,
          message: `Repair complete. Recovered ${result.recovered} job(s).`,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/cron-jobs/:jobId/enabled', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { setCronJobEnabled } = require('../services/cronJobsService');
      const { jobId } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          error: { message: 'enabled must be a boolean', status: 400 },
        });
      }

      if (jobId.startsWith('heartbeat-')) {
        return res.status(400).json({
          error: {
            message:
              'Heartbeat jobs cannot be enabled/disabled via this endpoint. Edit the heartbeat configuration instead.',
            status: 400,
          },
        });
      }

      logger.info('Toggling cron job enabled state', {
        userId: req.user.id,
        jobId,
        enabled,
      });

      const job = await setCronJobEnabled(jobId, enabled);

      recordActivityLogEventSafe({
        event_type: 'cron_job_updated',
        source: 'cron',
        title: `Cron job ${enabled ? 'enabled' : 'disabled'}: ${jobId}`,
        description: `Cron job "${jobId}" was ${enabled ? 'enabled' : 'disabled'}`,
        severity: 'info',
        actor_user_id: req.user.id,
        job_id: jobId,
        meta: { enabled },
      });

      res.json({ data: job });
    } catch (error) {
      next(error);
    }
  });

  router.post('/cron-jobs/:jobId/run', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { triggerCronJob } = require('../services/cronJobsService');
      const { jobId } = req.params;

      logger.info('Manual cron job run requested', {
        userId: req.user.id,
        jobId,
      });

      const job = await triggerCronJob(jobId);

      recordActivityLogEventSafe({
        event_type: 'cron_job_triggered',
        source: 'cron',
        title: `Cron job manually triggered: ${jobId}`,
        description: `Cron job "${jobId}" was manually triggered by user`,
        severity: 'info',
        actor_user_id: req.user.id,
        job_id: jobId,
        session_key: job.state?.lastSessionId || null,
        meta: { sessionId: job.state?.lastSessionId || null },
      });

      res.json({
        data: {
          success: true,
          sessionId: job.state?.lastSessionId || null,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/cron-jobs/:jobId/trigger', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { triggerCronJob } = require('../services/cronJobsService');
      const { jobId } = req.params;

      logger.info('Manual cron job trigger requested (deprecated /trigger endpoint)', {
        userId: req.user.id,
        jobId,
      });

      const job = await triggerCronJob(jobId);

      recordActivityLogEventSafe({
        event_type: 'cron_job_triggered',
        source: 'cron',
        title: `Cron job manually triggered: ${jobId}`,
        description: `Cron job "${jobId}" was manually triggered by user`,
        severity: 'info',
        actor_user_id: req.user.id,
        job_id: jobId,
        session_key: job.state?.lastSessionId || null,
        meta: { sessionId: job.state?.lastSessionId || null },
      });

      res.json({
        data: {
          success: true,
          sessionId: job.state?.lastSessionId || null,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/cron-jobs/:jobId', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { deleteCronJob } = require('../services/cronJobsService');
      const { jobId } = req.params;

      if (jobId.startsWith('heartbeat-')) {
        return res.status(400).json({
          error: {
            message: 'Heartbeat jobs cannot be deleted. They are defined in OpenClaw configuration.',
            status: 400,
          },
        });
      }

      logger.info('Deleting cron job', {
        userId: req.user.id,
        jobId,
      });

      await deleteCronJob(jobId);

      recordActivityLogEventSafe({
        event_type: 'cron_job_deleted',
        source: 'cron',
        title: `Cron job deleted: ${jobId}`,
        description: `Cron job "${jobId}" was permanently deleted`,
        severity: 'warning',
        actor_user_id: req.user.id,
        job_id: jobId,
      });

      res.json({ data: { success: true } });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  registerOpenClawCronRoutes,
};
