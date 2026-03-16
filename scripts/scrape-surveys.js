const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EMAIL = process.env.GREETING_EMAIL;
const PASSWORD = process.env.GREETING_PASSWORD;
const WORKSPACE = 15598;
const FORMS = [
  { id: 2936, key: 'interview1' },
  { id: 2938, key: 'interview2' },
  { id: 3780, key: 'coffeechat' },
];
const OUTPUT = path.join(__dirname, '..', 'data', 'survey-raw.json');

if (!EMAIL || !PASSWORD) {
  console.error('환경변수 필요: GREETING_EMAIL, GREETING_PASSWORD');
  process.exit(1);
}

async function fetchAllResponses(page, token, formId) {
  const listRes = await page.evaluate(async ({ token, formId, workspace }) => {
    const r = await fetch(
      `https://api.greetinghr.com/ats/api/forms/v1.0/workspaces/${workspace}/forms/${formId}/responses?page=0&pageSize=200&sorts=SUBMIT_DATE_DESC&status=SUBMITTED`,
      { headers: { Authorization: token } }
    );
    return r.json();
  }, { token, formId, workspace: WORKSPACE });

  const items = listRes.data?.datas || [];
  const all = [];

  for (let i = 0; i < items.length; i++) {
    const { response, respondent } = items[i];
    process.stdout.write(`\r  ${i + 1}/${items.length}`);
    const detail = await page.evaluate(async ({ token, formId, workspace, responseId }) => {
      const r = await fetch(
        `https://api.greetinghr.com/ats/api/forms/v1.0/workspaces/${workspace}/forms/${formId}/responses/${responseId}`,
        { headers: { Authorization: token } }
      );
      return r.json();
    }, { token, formId, workspace: WORKSPACE, responseId: response.id });
    all.push({
      name: respondent.name,
      jobTitle: respondent.category,
      submitDate: response.submitDate,
      answers: detail.data?.answers || [],
    });
    await page.waitForTimeout(80);
  }
  console.log();
  return all;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let token = null;

  console.log('로그인...');
  await page.goto('https://app.greetinghr.com/login');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);

  const [loginRes] = await Promise.all([
    page.waitForResponse(res => res.url().includes('/authn/login/password')),
    page.keyboard.press('Enter'),
  ]);
  const loginBody = await loginRes.json();
  console.log('DEBUG loginBody.data:', JSON.stringify(loginBody?.data));
  token = loginBody?.data?.accessToken ? `Bearer ${loginBody.data.accessToken}` : null;
  console.log('토큰 획득:', token ? '성공' : '실패');

  if (!token) {
    console.error('토큰 획득 실패');
    await browser.close();
    process.exit(1);
  }

  const result = {};
  for (const form of FORMS) {
    console.log(`\n[${form.key}] 수집 중...`);
    result[form.key] = await fetchAllResponses(page, token, form.id);
    console.log(`  ${result[form.key].length}건 완료`);
  }

  result.updatedAt = new Date().toISOString();
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  console.log('\n저장 완료:', OUTPUT);
  await browser.close();
})();
