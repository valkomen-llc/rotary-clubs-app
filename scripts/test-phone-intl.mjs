import { validatePhoneNumber, validateForMeta } from '../server/lib/phone.js';
import prisma from '../server/lib/prisma.js';

async function main() {
  const logs = await prisma.whatsAppMessageLog.findMany({
    where: { campaignId: 'dac8a1d3-8449-4ec0-8f59-af44b8c8d763' },
    include: { contact: true }
  });

  console.log(`Analyzing ${logs.length} campaign message logs:`);
  let validCount = 0;
  let pendingCount = 0;
  let invalidCount = 0;

  const validContacts = [];
  const pendingContacts = [];
  const invalidContacts = [];

  for (const log of logs) {
    const raw = log.contact?.phone;
    const v = validatePhoneNumber(raw);
    const item = {
      name: log.contact ? `${log.contact.name} ${log.contact.lastName || ''}`.trim() : 'N/A',
      rawPhone: raw,
      status: v.status,
      e164Formatted: v.e164Formatted,
      country: v.country,
      reason: v.reason
    };

    if (v.ok && v.status === 'valid') {
      validCount++;
      validContacts.push(item);
    } else if (v.status === 'pending_review') {
      pendingCount++;
      pendingContacts.push(item);
    } else {
      invalidCount++;
      invalidContacts.push(item);
    }
  }

  console.log('Results:');
  console.log(`- Valid / Ready for Meta: ${validCount} / ${logs.length}`);
  console.log(`- Pending Review: ${pendingCount} / ${logs.length}`);
  console.log(`- Invalid: ${invalidCount} / ${logs.length}`);

  console.log('\n--- Sample Valid International Contacts (previously failed) ---');
  console.log(validContacts.filter(c => !c.e164Formatted.startsWith('+57')).slice(0, 5));

  console.log('\n--- Pending Review Contacts ---');
  console.log(pendingContacts);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
