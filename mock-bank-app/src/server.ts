import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  confirmSubAccount,
  findMember,
  formatCents,
  getPendingSubAccount,
  members,
  stagePendingSubAccount,
  type SubAccount,
} from './data/members.js';
import {
  APP_ERROR_DEPOSIT_TRIGGER,
  SESSION_TIMEOUT_MEMBER_ID,
  SLOW_LOAD_DELAY_MS,
  SLOW_LOAD_MEMBER_ID,
} from './faults.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (_req, res) => {
  res.redirect('/search');
});

app.get('/search', (req, res) => {
  const query = typeof req.query.memberId === 'string' ? req.query.memberId.trim() : '';

  if (!query) {
    res.render('search', { title: 'Member Search', query: '' });
    return;
  }

  const results = members.filter((m) => m.memberId === query);
  res.render('search', {
    title: 'Member Search',
    query,
    results,
    notFound: results.length === 0,
  });
});

app.get('/members/:memberId', async (req, res) => {
  if (req.params.memberId === SESSION_TIMEOUT_MEMBER_ID) {
    res.status(440).render('session_expired', { title: 'Session Expired' });
    return;
  }

  if (req.params.memberId === SLOW_LOAD_MEMBER_ID) {
    await new Promise((resolve) => setTimeout(resolve, SLOW_LOAD_DELAY_MS));
  }

  const member = findMember(req.params.memberId);

  if (!member) {
    res.status(404).render('not_found', { title: 'Record Not Found', memberId: req.params.memberId });
    return;
  }

  res.render('member_detail', { title: `Member ${member.memberId}`, member, formatCents });
});

app.get('/members/:memberId/new-sub-account', (req, res) => {
  const member = findMember(req.params.memberId);
  if (!member) {
    res.status(404).render('not_found', { title: 'Record Not Found', memberId: req.params.memberId });
    return;
  }
  if (member.status !== 'ACTIVE') {
    res.status(403).render('member_detail', { title: `Member ${member.memberId}`, member, formatCents });
    return;
  }

  res.render('new_sub_account', {
    title: 'Open New Sub-Account',
    member,
    formValues: { accountType: 'Savings', openingDeposit: '' },
  });
});

app.post('/members/:memberId/new-sub-account', (req, res) => {
  const member = findMember(req.params.memberId);
  if (!member) {
    res.status(404).render('not_found', { title: 'Record Not Found', memberId: req.params.memberId });
    return;
  }
  if (member.status !== 'ACTIVE') {
    res.status(403).render('member_detail', { title: `Member ${member.memberId}`, member, formatCents });
    return;
  }

  const accountType = String(req.body.accountType ?? '') as SubAccount['type'];
  const depositRaw = String(req.body.openingDeposit ?? '').trim();

  if (depositRaw === APP_ERROR_DEPOSIT_TRIGGER) {
    res.status(500).render('app_error', { title: 'System Error', refCode: `ERR-${Date.now()}` });
    return;
  }

  const errors: string[] = [];

  if (!['Savings', 'Checking', 'Certificate'].includes(accountType)) {
    errors.push('Account type is invalid.');
  }
  const depositDollars = Number(depositRaw);
  if (!depositRaw || Number.isNaN(depositDollars) || depositDollars <= 0) {
    errors.push('Opening deposit must be a positive number.');
  }

  if (errors.length > 0) {
    res.status(422).render('new_sub_account', {
      title: 'Open New Sub-Account',
      member,
      errors,
      formValues: { accountType, openingDeposit: depositRaw },
    });
    return;
  }

  const pending = stagePendingSubAccount(member.memberId, accountType, Math.round(depositDollars * 100));
  res.render('confirm_sub_account', {
    title: 'Confirm New Sub-Account',
    member,
    pending,
    formatCents,
  });
});

app.post('/members/:memberId/new-sub-account/confirm', (req, res) => {
  const member = findMember(req.params.memberId);
  if (!member) {
    res.status(404).render('not_found', { title: 'Record Not Found', memberId: req.params.memberId });
    return;
  }

  const token = String(req.body.confirmationToken ?? '');
  const pending = getPendingSubAccount(token);
  if (!pending || pending.memberId !== member.memberId) {
    res.status(409).render('not_found', {
      title: 'Confirmation Expired',
      memberId: `${member.memberId} (confirmation token expired or invalid)`,
    });
    return;
  }

  const subAccount = confirmSubAccount(token)!;
  res.render('sub_account_success', {
    title: 'Sub-Account Opened',
    member,
    subAccount,
    formatCents,
  });
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`[mock-bank-app] Legacy Core Servicing Console listening on http://localhost:${PORT}`);
});

export { app };
