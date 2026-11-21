import assert from 'assert';
import path from 'path';
import fs from 'fs';
import {
  validateUrl,
  sanitizeFilename,
  resolveSafePath,
  checkSystemDependencies,
  apiRateLimiter,
  downloadQueue,
  formatDuration,
} from '../src/core';

async function runTests() {
  console.log('🧪 Starting vidsnag automated test suite...\n');

  // Test 1: Duration formatting
  console.log('1. Testing formatDuration:');
  assert.strictEqual(formatDuration(0), '00:00');
  assert.strictEqual(formatDuration(65), '01:05');
  assert.strictEqual(formatDuration(3665), '1:01:05');
  console.log('   ✔ formatDuration works correctly.');

  // Test 2: URL Validation
  console.log('\n2. Testing URL validation (Zod):');
  assert.strictEqual(validateUrl('https://www.youtube.com/watch?v=123'), 'https://www.youtube.com/watch?v=123');
  assert.strictEqual(validateUrl('http://vimeo.com/456'), 'http://vimeo.com/456');

  assert.throws(() => validateUrl('ftp://example.com/video.mp4'), /Only HTTP and HTTPS URLs are allowed/);
  assert.throws(() => validateUrl('file:///etc/passwd'), /Only HTTP and HTTPS URLs are allowed/);
  assert.throws(() => validateUrl('javascript:alert(1)'), /Only HTTP and HTTPS URLs are allowed/);
  assert.throws(() => validateUrl('not-a-url'), /Only HTTP and HTTPS URLs are allowed/);
  assert.throws(() => validateUrl(''), /URL cannot be empty/);
  console.log('   ✔ URL validation blocks non-http schemes, empty strings, and invalid URLs.');

  // Test 3: Filename sanitization
  console.log('\n3. Testing filename sanitization:');
  assert.strictEqual(sanitizeFilename('../../../secret.txt'), 'secret.txt');
  assert.strictEqual(sanitizeFilename('my:bad?name*.mp4'), 'my_bad_name_.mp4');
  assert.strictEqual(sanitizeFilename('..hidden'), 'hidden');
  console.log('   ✔ Filename sanitization strips dangerous characters and path traversal.');

  // Test 4: Path traversal protection
  console.log('\n4. Testing Path Traversal Defense (resolveSafePath):');
  const baseDir = path.resolve('./downloads');
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

  const safePath = resolveSafePath(baseDir, 'test.mp4');
  assert.strictEqual(safePath, path.join(baseDir, 'test.mp4'));

  // Attempt traversal
  const traversalAttempt = resolveSafePath(baseDir, '../../etc/passwd');
  // It should sanitize to passwd inside baseDir, never escaping baseDir
  assert.strictEqual(traversalAttempt, path.join(baseDir, 'passwd'));
  assert(traversalAttempt.startsWith(baseDir));
  console.log('   ✔ resolveSafePath guarantees targets remain within baseDir.');

  // Test 5: Dependency detection
  console.log('\n5. Testing checkSystemDependencies:');
  const deps = await checkSystemDependencies();
  console.log(`   yt-dlp available: ${deps.ytDlp.available} (${deps.ytDlp.version || deps.ytDlp.error})`);
  console.log(`   ffmpeg available: ${deps.ffmpeg.available} (${deps.ffmpeg.version || deps.ffmpeg.error})`);
  assert.strictEqual(deps.ytDlp.available, true, 'yt-dlp must be detected as available');
  assert.strictEqual(deps.ffmpeg.available, true, 'ffmpeg must be detected as available');
  assert.strictEqual(deps.allSatisfied, true);
  console.log('   ✔ System dependencies verified successfully.');

  // Test 6: Rate Limiter
  console.log('\n6. Testing in-memory rate limiter:');
  const testIp = '192.168.1.100';
  for (let i = 0; i < 5; i++) {
    const res = apiRateLimiter.check(testIp);
    assert.strictEqual(res.allowed, true);
  }
  console.log('   ✔ Rate limiter tracking active.');

  // Test 7: Concurrency Queue
  console.log('\n7. Testing concurrency manager:');
  assert(downloadQueue.max >= 1);
  const release1 = await downloadQueue.acquire();
  assert.strictEqual(downloadQueue.active, 1);
  release1();
  assert.strictEqual(downloadQueue.active, 0);
  console.log('   ✔ Concurrency manager acquisition and release verified.');

  console.log('\n🎉 ALL CORE AND SECURITY TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
