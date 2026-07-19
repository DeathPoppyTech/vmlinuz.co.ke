const https = require('https');
const { URL } = require('url');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method Not Allowed',
            explanation: 'poppy\'s http gateway requires a POST request containing the configuration payload.'
        });
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
        try {
            const config = JSON.parse(body);
            let { url, method = 'GET', headers = {}, params = {}, auth = {}, bodyType = 'None', bodyData = '' } = config;

            if (!url) {
                return res.status(400).json({
                    error: 'Missing URL',
                    explanation: 'The request could not be initialized because the target URL field is completely empty.'
                });
            }

            if (!/^https?:\/\//i.test(url)) {
                url = 'https://' + url;
            }

            const binPatterns = [/bin/i, /mockbin/i, /requestbin/i, /pipedream/i, /webhook/i, /httpbin/i];
            const isBinUrl = binPatterns.some(pattern => pattern.test(url));
            const warning = isBinUrl ? 'bin urls capture requests but never actually send them to a server!' : null;

            let parsedUrl;
            try {
                parsedUrl = new URL(url);
            } catch (e) {
                return res.status(400).json({
                    error: 'Malformed URL Structure',
                    explanation: 'The URL provided does not conform to standard web address formatting structure. Ensure it includes a valid domain or IP address.'
                });
            }

            Object.keys(params).forEach(key => {
                if (key) parsedUrl.searchParams.append(key, params[key]);
            });

            const requestHeaders = {};
            Object.keys(headers).forEach(key => {
                if (key) requestHeaders[key.toLowerCase()] = headers[key];
            });

            if (auth && auth.type && auth.type !== 'None') {
                switch (auth.type) {
                    case 'Bearer Token':
                        if (!auth.token) {
                            return res.status(400).json({
                                error: 'Missing Authentication Token',
                                explanation: 'Bearer Token authentication was selected, but the token field was left completely blank.'
                            });
                        }
                        requestHeaders['authorization'] = `Bearer ${auth.token}`;
                        break;

                    case 'Basic Auth':
                        if (!auth.username && !auth.password) {
                            return res.status(400).json({
                                error: 'Missing Authentication Credentials',
                                explanation: 'Basic Authentication requires at least a username or password value to generate credentials.'
                            });
                        }
                        const credentials = Buffer.from(`${auth.username || ''}:${auth.password || ''}`).toString('base64');
                        requestHeaders['authorization'] = `Basic ${credentials}`;
                        break;

                    case 'API Key':
                        if (!auth.key || !auth.value) {
                            return res.status(400).json({
                                error: 'Incomplete API Key Setup',
                                explanation: 'API Key delivery requires both a key name and a matching payload value.'
                            });
                        }
                        if (auth.addTo === 'Headers') {
                            requestHeaders[auth.key.toLowerCase()] = auth.value;
                        } else {
                            parsedUrl.searchParams.append(auth.key, auth.value);
                        }
                        break;

                    case 'OAuth 2.0':
                        if (!auth.accessToken) {
                            return res.status(400).json({
                                error: 'Missing Access Token',
                                explanation: 'OAuth 2.0 requires an active Access Token to communicate with protected resource servers.'
                            });
                        }
                        requestHeaders['authorization'] = `Bearer ${auth.accessToken}`;
                        break;

                    default:
                        if (auth.headerName && auth.headerValue) {
                            requestHeaders[auth.headerName.toLowerCase()] = auth.headerValue;
                        }
                        break;
                }
            }

            let payload = '';
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
                if (bodyType === 'JSON') {
                    if (typeof bodyData === 'object') {
                        payload = JSON.stringify(bodyData);
                    } else if (bodyData) {
                        try {
                            JSON.parse(bodyData);
                            payload = bodyData;
                        } catch (e) {
                            return res.status(400).json({
                                error: 'Invalid JSON Payload Structure',
                                explanation: 'The syntax within your request body contains format mismatches or missing closures. Verify commas, brackets, and quotes.'
                            });
                        }
                    }
                    if (!requestHeaders['content-type']) {
                        requestHeaders['content-type'] = 'application/json';
                    }
                } else if (bodyType === 'x-www-form-urlencoded' && typeof bodyData === 'object') {
                    payload = new URLSearchParams(bodyData).toString();
                    if (!requestHeaders['content-type']) {
                        requestHeaders['content-type'] = 'application/x-www-form-urlencoded';
                    }
                } else if (bodyData) {
                    payload = typeof bodyData === 'object' ? JSON.stringify(bodyData) : String(bodyData);
                }
            }

            if (payload) {
                requestHeaders['content-length'] = Buffer.byteLength(payload);
            }

            const options = {
                method: method.toUpperCase(),
                headers: requestHeaders,
                timeout: 10000
            };

            const clientRequest = https.request(parsedUrl, options, (clientResponse) => {
                let responseData = '';
                clientResponse.on('data', chunk => { responseData += chunk; });
                clientResponse.on('end', () => {
                    let parsedResponse;
                    const contentType = clientResponse.headers['content-type'] || '';
                    
                    if (contentType.includes('application/json')) {
                        try {
                            parsedResponse = JSON.parse(responseData);
                        } catch (e) {
                            parsedResponse = responseData;
                        }
                    } else {
                        parsedResponse = responseData;
                    }

                    const responsePayload = {
                        status: clientResponse.statusCode,
                        statusText: clientResponse.statusMessage,
                        headers: clientResponse.headers,
                        body: parsedResponse
                    };

                    if (warning) {
                        responsePayload.warning = warning;
                    }

                    if (clientResponse.statusCode >= 400) {
                        responsePayload.errorAnalysis = getErrorExplanation(clientResponse.statusCode, parsedUrl.host);
                    }

                    res.status(200).json(responsePayload);
                });
            });

            clientRequest.on('error', (err) => {
                let errorType = 'Connection Error';
                let explanation = 'The system encountered an unexpected low-level network failure while processing this request.';

                if (err.code === 'ENOTFOUND') {
                    errorType = 'Host Unreachable (DNS Failure)';
                    explanation = `The host domain "${parsedUrl.host}" could not be resolved to an active IP address. Double check spellings or records.`;
                } else if (err.code === 'ECONNREFUSED') {
                    errorType = 'Connection Refused';
                    explanation = `The target server at ${parsedUrl.host} actively rejected the connection attempt on port ${parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80')}.`;
                } else if (err.code === 'ETIMEDOUT') {
                    errorType = 'Network Timeout';
                    explanation = 'The remote server took too long to return bytes or finish answering. The current connection gateway threshold is set to 10 seconds.';
                }

                res.status(200).json({
                    status: 0,
                    error: errorType,
                    explanation: explanation,
                    warning: warning || undefined
                });
            });

            if (payload) {
                clientRequest.write(payload);
            }
            clientRequest.end();

        } catch (err) {
            res.status(500).json({
                error: 'Internal Request Gateway Failure',
                explanation: 'An unhandled breakdown occurred inside poppy\'s http core runtime processing logic.'
            });
        }
    });
};

function getErrorExplanation(statusCode, host) {
    switch (statusCode) {
        case 400: return 'Bad Request: The destination application server could not process the submitted configuration structure or arguments.';
        case 401: return 'Unauthorized: Access tokens, authorization headers, or matching cryptographic signatures are either absent, revoked, or expired.';
        case 403: return `Forbidden: Authenticated context established successfully, but your specific credentials lack operational permission flags to access pathways on ${host}.`;
        case 404: return `Not Found: The explicit target resource path requested does not exist or has been permanently moved from the server directory trees at ${host}.`;
        case 405: return 'Method Not Allowed: The destination resource path maps correctly, but refuses transactions utilizing this specific request method.';
        case 429: return 'Too Many Requests: Rate limiting thresholds have been exceeded. The target platform is throttling operations from this gateway origin.';
        case 500: return `Internal Server Error: The remote application code execution framework at ${host} crashed or encountered a systemic configuration fault while generating a response.`;
        case 502: return 'Bad Gateway: An intermediate proxy routing layer or load balancer received an invalid, unreadable packet reply from upstream cluster elements.';
        case 503: return 'Service Unavailable: Target operational servers are temporarily offline, undergoing capacity maintenance, or handling catastrophic queue volumes.';
        case 504: return 'Gateway Timeout: An intermediate network broker timed out waiting for deeper microservices inside the target platform topology to deliver structural records.';
        default: return `Unspecified Endpoint Exception: Target server returned an anomalous structural status status code of ${statusCode}. Check systemic infrastructure documentation.`;
    }
}
