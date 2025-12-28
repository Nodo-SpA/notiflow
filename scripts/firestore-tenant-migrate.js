/**
 * Migra colecciones legacy a la estructura multitenant:
 *   tenants/{schoolId}/{collection}/{docId}
 *
 * Colecciones migradas: students, groups, messages, events, users, templates.
 * Usa GOOGLE_APPLICATION_CREDENTIALS para credenciales de servicio.
 *
 * Modo dry-run: DRY_RUN=true node scripts/firestore-tenant-migrate.js
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();
const dryRun = process.env.DRY_RUN === 'true';

const collections = ['students', 'groups', 'messages', 'events', 'users', 'templates', 'deviceTokens'];

async function migrateCollection(name) {
  console.log(`\n▶️  Migrando colección ${name}...`);
  const snap = await db.collection(name).get();
  if (snap.empty) {
    console.log(`   (vacía)`);
    return;
  }

  let migrated = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const schoolId = (data.schoolId || '').trim() || 'global';
    const targetRef = db.collection('tenants').doc(schoolId).collection(name).doc(doc.id);

    // Asegura que el campo id exista en el documento
    const payload = { ...data, id: data.id || doc.id, schoolId };

    if (dryRun) {
      console.log(`   [dry-run] ${name}/${doc.id} -> tenants/${schoolId}/${name}/${doc.id}`);
      migrated++;
      continue;
    }

    await targetRef.set(payload, { merge: true });
    await doc.ref.delete();
    migrated++;
  }
  console.log(`   ✅ ${migrated} documentos migrados de ${name}`);
}

async function main() {
  console.log(dryRun ? '--- DRY RUN ---' : '--- EJECUCIÓN ---');
  for (const coll of collections) {
    await migrateCollection(coll);
  }
  console.log('🔁 Listo. Revisa las colecciones legacy y reglas/índices.');
}

main().catch((err) => {
  console.error('❌ Error en la migración:', err);
  process.exit(1);
});
