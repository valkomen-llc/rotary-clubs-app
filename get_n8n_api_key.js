const fs = require('fs');
const fetch = require('node-fetch');

async function go() {
    try {
        const rawCookies = fs.readFileSync('n8n_cookies.txt', 'utf8');
        const cookies = rawCookies.split('\n').filter(l => !l.startsWith('#') && l.trim().length > 0).map(l => {
            const parts = l.split('\t');
            return `${parts[5]}=${parts[6]}`;
        }).join('; ');

        const res = await fetch('https://n8n-n8n.urnhq7.easypanel.host/rest/api-keys', {
            headers: {
                'cookie': cookies
            }
        });
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}
go();
