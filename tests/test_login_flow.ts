async function testLogin() {
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: 'owner@nbte.edu.in',
      password: 'Password123!',
    }),
  });
  const data = await res.json();
  console.log('LOGIN RESPONSE:', data);
}

testLogin();

