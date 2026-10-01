import { Router } from 'express';
import { verifyWebhook, receiveWebhook } from '../controllers/webhookController';

const router = Router();

// GET /webhook: Validación de webhook por Meta
router.get('/', verifyWebhook);

// POST /webhook: Recepción de mensajes y eventos de WhatsApp
router.post('/', receiveWebhook);

export default router;
