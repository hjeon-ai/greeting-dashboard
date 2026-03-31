const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const EMAIL = process.env.GREETING_EMAIL;
const PASSWORD = process.env.GREETING_PASSWORD;
const PASSWORD_HASH = process.env.GREETING_PASSWORD_HASH;
const WORKSPACE = 15598;
const FORMS = [
  { id: 2936, key: 'interview1' },
  { id: 2938, key: 'interview2' },
  { id: 3780, key: 'coffeechat' },
];
const OUTPUT = path.join(__dirname, '..', 'data', 'survey-raw.json');

if (!EMAIL || (!PASSWORD && !PASSWORD_HASH)) {
  console.error('환경변수 필요: GREETING_EMAIL, GREETING_PASSWORD 또는 GREETING_PASSWORD_HASH');
  process.exit(1);
}

async function apiFetch(url, token) {
  const r = await fetch(url, { headers: { Authorization: token, timezone: '-540' } });
  return r.json();
}

async function fetchAllResponses(token, formId) {
  const listRes = await apiFetch(
    `https://api.greetinghr.com/ats/api/forms/v1.0/workspaces/${WORKSPACE}/forms/${formId}/responses?page=0&pageSize=200&sorts=SUBMIT_DATE_DESC&status=SUBMITTED`,
    token
  );

  const items = listRes.data?.datas || [];
  const all = [];

  for (let i = 0; i < items.length; i++) {
    const { response, respondent } = items[i];
    process.stdout.write(`\r  ${i + 1}/${items.length}`);
    const detail = await apiFetch(
      `https://api.greetinghr.com/ats/api/forms/v1.0/workspaces/${WORKSPACE}/forms/${formId}/responses/${response.id}`,
      token
    );
    all.push({
      name: respondent.name,
      jobTitle: respondent.category,
      submitDate: response.submitDate,
      answers: detail.data?.answers || [],
    });
    await new Promise(r => setTimeout(r, 80));
  }
  console.log();
  return all;
}

async function loginWithAPI(email, passwordHash) {
  console.log('로그인 (직접 API)...');
  const res = await fetch('https://api.greetinghr.com/authn/login/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, platform: 'WEB', password: passwordHash }),
  });
  const json = await res.json();
  if (!json.success) {
    console.error('로그인 실패:', json.message || JSON.stringify(json));
  }
  return json?.data?.accessToken || null;
}

(async () => {
  // PASSWORD_HASH가 있으면 그대로 사용, 없으면 PASSWORD를 MD5로 변환
  const hash = PASSWORD_HASH || (PASSWORD ? crypto.createHash('md5').update(PASSWORD).digest('hex') : null);
  if (!hash) { console.error('비밀번호 또는 해시가 필요합니다'); process.exit(1); }

  console.log('PASSWORD_HASH 사용:', !!PASSWORD_HASH, '/ PASSWORD→MD5:', !!PASSWORD && !PASSWORD_HASH);
  const token = await loginWithAPI(EMAIL, hash);
  console.log('토큰 획득:', token ? '성공' : '실패');
  if (!token) { console.error('토큰 획득 실패'); process.exit(1); }

  const result = {};
  for (const form of FORMS) {
    console.log(`\n[${form.key}] 수집 중...`);
    result[form.key] = await fetchAllResponses(token, form.id);
    console.log(`  ${result[form.key].length}건 완료`);
  }

  const totalCount = Object.values(result).filter(Array.isArray).reduce((s, a) => s + a.length, 0);
  if (totalCount === 0) {
    console.error('수집된 데이터가 없어 저장을 건너뜁니다');
    process.exit(1);
  }

  result.updatedAt = new Date().toISOString();
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log('\n저장 완료:', OUTPUT);
})();
