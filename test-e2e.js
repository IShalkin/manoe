#!/usr/bin/env node

/**
 * MANOE E2E Test Runner
 * Tests MANOE Multi-Agent Narrative Orchestration Engine
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

/**
 * Load configuration with error handling
 */
function loadConfig() {
  const configPath = path.join(__dirname, 'testsprite-config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    throw new Error(`Failed to load configuration: ${error.message}`);
  }
}

/**
 * Get authorization header from environment
 * Requires TEST_AUTH_TOKEN environment variable to be set
 */
function getAuthHeader() {
  const token = process.env.TEST_AUTH_TOKEN;
  
  if (!token) {
    throw new Error(
      'TEST_AUTH_TOKEN environment variable is required.\n' +
      'Usage: TEST_AUTH_TOKEN="your-token-here" node test-e2e.js'
    );
  }
  
  return `Bearer ${token}`;
}

/**
 * Make HTTP/HTTPS request with proper header handling
 */
function makeRequest(endpoint, runId = null) {
  return new Promise((resolve, reject) => {
    const url = runId && endpoint.url.includes('{runId}')
      ? endpoint.url.replace('{runId}', runId)
      : endpoint.url;

    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    // Merge headers from endpoint with defaults
    const defaultHeaders = {
      'Content-Type': 'application/json'
    };

    const headers = endpoint.headers
      ? { ...defaultHeaders, ...endpoint.headers }
      : defaultHeaders;

    const options = {
      method: endpoint.method,
      headers: headers,
      timeout: endpoint.timeout || 10000
    };

    const req = client.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const result = {
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        };
        resolve(result);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    // Set timeout from endpoint configuration
    if (endpoint.timeout) {
      req.setTimeout(endpoint.timeout, () => {
        req.abort();
        reject(new Error(`Request timeout after ${endpoint.timeout}ms`));
      });
    }

    if (endpoint.body) {
      req.write(JSON.stringify(endpoint.body));
    }

    req.end();
  });
}

/**
 * Validate response structure based on endpoint configuration
 */
function validateResponse(response, endpoint) {
  if (!endpoint.validation) {
    return true;
  }

  const { responseHas, contentType } = endpoint.validation;

  // Check for contentType if specified
  if (contentType) {
    const responseContentType = response.headers['content-type'];
    
    if (!responseContentType) {
      console.log(`   ❌ Response validation failed - missing 'content-type' header`);
      return false;
    }

    // Check if content-type contains the expected type (case-insensitive)
    const expectedType = contentType;
    const actualType = responseContentType.toLowerCase();
    
    if (!actualType.includes(expectedType.toLowerCase())) {
      console.log(`   ❌ Response validation failed - expected '${expectedType}', got '${responseContentType}'`);
      return false;
    }
  }

  // Check for required response fields
  if (!responseHas) {
    return true;
  }

  try {
    const data = JSON.parse(response.data);
    const hasRequiredFields = responseHas.every(field => {
      const fieldPath = field.split('.');
      let current = data;
      for (const key of fieldPath) {
        if (current && typeof current === 'object' && key in current) {
          current = current[key];
        } else {
          return false;
        }
      }
      return current !== undefined && current !== null;
    });

    if (!hasRequiredFields) {
      console.log(`   ❌ Response validation failed - missing required fields: ${responseHas.join(', ')}`);
    }

    return hasRequiredFields;
  } catch (error) {
    console.log(`   ❌ Response validation failed - could not parse JSON`);
    return false;
  }
}

/**
 * Test a single endpoint
 */
async function testEndpoint(endpoint, runId = null) {
  totalTests++;
  const testName = endpoint.name;
  console.log(`\n🧪 Test ${totalTests}: ${testName}`);
  console.log(`   ${endpoint.method} ${endpoint.url.replace('{runId}', runId || '<runId>')}`);

  try {
    const response = await makeRequest(endpoint, runId);

    // Validate HTTP status code
    if (response.statusCode !== endpoint.expectedStatus) {
      console.log(`   ❌ FAIL - Expected ${endpoint.expectedStatus}, got ${response.statusCode}`);
      failedTests++;
      return null;
    }

    // Validate response structure if configured
    if (!validateResponse(response, endpoint)) {
      console.log(`   ❌ FAIL - Response validation failed`);
      failedTests++;
      return null;
    }

    console.log(`   ✅ PASS - Status: ${response.statusCode}`);
    passedTests++;
    return response;
  } catch (error) {
    // User-friendly error message without sensitive details
    console.log(`   ❌ FAIL - ${error.message}`);
    failedTests++;
    return null;
  }
}

/**
 * Check service health
 */
async function checkService(service) {
  console.log(`\n🔍 Checking ${service.name}...`);

  try {
    const urlObj = new URL(service.checkUrl);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    return new Promise((resolve) => {
      const req = client.request(service.checkUrl, { method: 'GET', timeout: 5000 }, (res) => {
        const status = res.statusCode === 200 ? '✅ OK' : `❌ ${res.statusCode}`;
        console.log(`   ${status}`);
        resolve(res.statusCode === 200);
      });

      req.on('error', () => {
        console.log(`   ❌ Not reachable`);
        resolve(false);
      });

      req.on('timeout', () => {
        req.abort();
        console.log(`   ❌ Timeout`);
        resolve(false);
      });

      req.end();
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🚀 Starting MANOE E2E Tests');
  console.log('='.repeat(50));

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(`\n❌ Failed to load configuration: ${error.message}`);
    process.exit(1);
  }

  // Add Authorization header to all endpoints
  const authHeader = getAuthHeader();

  // Inject auth header into endpoints
  for (const endpoint of config.endpoints) {
    if (!endpoint.headers) {
      endpoint.headers = {};
    }
    endpoint.headers['Authorization'] = authHeader;
  }

  // Check service health if configured
  if (config.services) {
    for (const service of config.services) {
      await checkService(service);
    }
  }

  let currentRunId = null;

  // Test 1: Health Check
  const healthResponse = await testEndpoint(config.endpoints[0]);
  if (!healthResponse) {
    console.log('\n❌ Health check failed. Make sure API Gateway is running.');
    console.log('   Run: docker-compose up -d');
    process.exit(1);
  }

  // Test 2: Generate Story
  const generateResponse = await testEndpoint(config.endpoints[1]);
  if (generateResponse && generateResponse.data) {
    try {
      const result = JSON.parse(generateResponse.data);
      currentRunId = result.runId;
      if (currentRunId) {
        console.log(`   📝 Run ID: ${currentRunId}`);
      } else {
        console.log(`   ❌ FAIL - Run ID not found in response`);
        failedTests++;
        passedTests--;
      }
    } catch (e) {
      console.log(`   ❌ FAIL - Could not get runId from response: ${e.message}`);
      failedTests++;
      passedTests--;
      currentRunId = null;
    }
  }

  // Test 3: Stream Events (if we have a runId)
  if (currentRunId) {
    console.log(`\n🔄 Streaming events for ${currentRunId}...`);
    // This is a basic check. A full SSE client would be needed for more complex validation.
    const streamResponse = await testEndpoint(config.endpoints[2], currentRunId);
  }

  // Test 4: Cancel Generation (if we have a runId)
  if (currentRunId) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait a bit
    await testEndpoint(config.endpoints[3], currentRunId);
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results:');
  console.log(`   Total:  ${totalTests}`);
  console.log(`   Passed: ${passedTests} ✅`);
  console.log(`   Failed: ${failedTests} ❌`);

  if (failedTests === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

runTests().catch(error => {
  // User-friendly error message
  console.error('Fatal error: An unexpected error occurred');
  console.error('Hint: Ensure TEST_AUTH_TOKEN environment variable is set');
  process.exit(1);
});
