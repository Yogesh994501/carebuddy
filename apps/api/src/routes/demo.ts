import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { seedDemoData, clearDemoData, DEMO_USERS } from '../services/demoService';

const router = Router();

// POST /api/demo/reset - Reset demo environment idempotently
router.post('/reset', async (_req: Request, res: Response) => {
  try {
    const result = await seedDemoData(prisma);
    return res.json({
      success: true,
      message: 'Demo environment reset successfully.',
      profileId: result.profileId,
      demoUsers: [
        { role: 'Elderly Owner', name: DEMO_USERS.elderly.name, email: DEMO_USERS.elderly.email },
        { role: 'Family (Daughter)', name: DEMO_USERS.familyPriya.name, email: DEMO_USERS.familyPriya.email },
        { role: 'Family (Son)', name: DEMO_USERS.familyRahul.name, email: DEMO_USERS.familyRahul.email },
        { role: 'Caregiver (RN)', name: DEMO_USERS.caregiverAnita.name, email: DEMO_USERS.caregiverAnita.email }
      ],
      medicationCount: result.medicationCount,
      appointmentCount: result.appointmentCount
    });
  } catch (err: any) {
    return res.status(500).json({
      error: 'DEMO_RESET_FAILED',
      message: err.message || 'Failed to reset demo environment'
    });
  }
});

// GET /api/demo/accounts - List demo accounts for 1-click login
router.get('/accounts', (_req: Request, res: Response) => {
  return res.json({
    accounts: [
      { role: 'Elderly', name: DEMO_USERS.elderly.name, email: DEMO_USERS.elderly.email, description: 'Ramesh Patel (72yo, manages daily medications & Sprig assistant)' },
      { role: 'Family (Daughter)', name: DEMO_USERS.familyPriya.name, email: DEMO_USERS.familyPriya.email, description: 'Priya Patel (Monitors adherence, vitals & doctor appointments)' },
      { role: 'Family (Son)', name: DEMO_USERS.familyRahul.name, email: DEMO_USERS.familyRahul.email, description: 'Rahul Patel (Remote family view & shared timeline)' },
      { role: 'Caregiver', name: DEMO_USERS.caregiverAnita.name, email: DEMO_USERS.caregiverAnita.email, description: 'Anita Sharma, RN (Clinical notes, records assisted doses)' }
    ],
    defaultPassword: 'DemoPassword123!'
  });
});

export default router;
