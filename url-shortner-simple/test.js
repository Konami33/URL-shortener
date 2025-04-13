const axios = require('axios');

async function testUrlShortener() {
  try {
    // Test creating a short URL
    console.log('Testing URL shortening...');
    const longUrl = 'https://www.google.com';
    const createResponse = await axios.post('http://localhost:3000/urls', {
      longUrl
    });
    console.log('Short URL created:', createResponse.data.shortUrl);

    // Extract shortUrlId from the response
    const shortUrlId = createResponse.data.shortUrl.split('/').pop();
    console.log('Short URL ID:', shortUrlId);

    // Test redirect
    console.log('\nTesting redirect...');
    const redirectResponse = await axios.get(`http://localhost:3000/${shortUrlId}`, {
      maxRedirects: 0,
      validateStatus: function (status) {
        return status >= 200 && status < 400; // Accept redirect status codes
      }
    });
    console.log('Redirect status:', redirectResponse.status);
    console.log('Redirect location:', redirectResponse.headers.location);

    console.log('\nAll tests passed successfully!');
  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the tests
testUrlShortener(); 