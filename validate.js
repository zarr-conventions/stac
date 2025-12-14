import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs';
import https from 'https';

// Read command line arguments
const schemaPath = process.argv[2];
const dataPath = process.argv[3];

if (!schemaPath || !dataPath) {
  console.error('Usage: node validate.js <schema.json> <data.json>');
  process.exit(1);
}

// Function to load schema from URL
async function loadSchema(uri) {
  return new Promise((resolve, reject) => {
    https.get(uri, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function validate() {
  try {
    // Read files
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    // Configure AJV with remote schema loading
    const ajv = new Ajv({
      allErrors: true,
      loadSchema: loadSchema,
      strictSchema: false  // Allow loading external schemas
    });
    
    // Add format validators (for date-time, etc.)
    addFormats(ajv);

    // Compile schema (this will load remote schemas if needed)
    const validateFn = await ajv.compileAsync(schema);
    const valid = validateFn(data);

    if (valid) {
      console.log('✅ Validation successful!');
      process.exit(0);
    } else {
      console.log('❌ Validation failed!');
      console.log(JSON.stringify(validateFn.errors, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Validation error:', error.message);
    if (error.errors) {
      console.log(JSON.stringify(error.errors, null, 2));
    }
    process.exit(1);
  }
}

validate();
