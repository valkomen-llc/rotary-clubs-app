const fetch = require('node-fetch');

async function checkApi() {
  const response = await fetch('http://localhost:5001/api/clubs/by-domain?domain=app.clubplatform.org');
  const data = await response.json();
  console.log(data);
}
checkApi();
