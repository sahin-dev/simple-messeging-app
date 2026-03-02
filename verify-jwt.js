const jwt = require('jsonwebtoken');
require('dotenv').config();

const secret = process.env.JWT_SECRET || 'MySecret';
const expiresIn = process.env.JWT_EXPIRES_IN || '90d';

const payload = {
    id: "test_id",
    role: "USER",
    licence_id: "LIC123",
    nick_name: "testuser"
};

console.log('Testing with:');
console.log('- Secret:', secret);
console.log('- Expires In:', expiresIn);
console.log('- Payload:', payload);

try {
    const token = jwt.sign(payload, secret, { expiresIn });
    console.log('\nToken generated successfully:', token);

    const decoded = jwt.verify(token, secret);
    console.log('\nToken verified successfully!');
    console.log('Decoded Payload:', decoded);

    if (decoded.id === payload.id) {
        console.log('\nVerification PASSED: Decoded ID matches original ID.');
    } else {
        console.log('\nVerification FAILED: Decoded ID mismatch.');
    }
} catch (error) {
    console.error('\nVerification FAILED with error:', error.message);
}
