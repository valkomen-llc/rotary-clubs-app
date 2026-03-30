import jwt from 'jsonwebtoken';

async function run() {
    console.log("Logging into production...");
    const res = await fetch('https://app.clubplatform.org/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@rotary4271.org', password: 'Rotary4271!' })
    });
    
    if (!res.ok) { return; }
    const data = await res.json();
    
    console.log("Token payload decoded:", jwt.decode(data.token));
}
run();
