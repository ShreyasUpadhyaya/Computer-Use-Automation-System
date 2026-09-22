import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMember, formatCents, members } from './data/members.js';

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

app.get('/members/:memberId', (req, res) => {
  const member = findMember(req.params.memberId);

  if (!member) {
    res.status(404).render('not_found', { title: 'Record Not Found', memberId: req.params.memberId });
    return;
  }

  res.render('member_detail', { title: `Member ${member.memberId}`, member, formatCents });
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`[mock-bank-app] Legacy Core Servicing Console listening on http://localhost:${PORT}`);
});

export { app };
