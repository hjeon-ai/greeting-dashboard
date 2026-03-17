const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('비밀번호 입력: ', (pw) => {
  console.log('\nMD5 해시:', crypto.createHash('md5').update(pw).digest('hex'));
  rl.close();
});
