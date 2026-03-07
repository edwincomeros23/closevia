const fs = require('fs');
const http = require('http');

const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
const req = http.request({
  hostname: 'localhost',
  port: 4000,
  path: '/api/products/generate-details',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Authorization': 'Bearer test' // dummy or you can login
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:', body));
});

req.write(`--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="test_image.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`);
const fileStream = fs.createReadStream('test_image.jpg');
fileStream.pipe(req, { end: false });
fileStream.on('end', () => {
  req.end(`\r\n--${boundary}--\r\n`);
});
