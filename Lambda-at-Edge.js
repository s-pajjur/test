import crypto from 'crypto';
import https from 'https';

const MEDIA_TAILOR_ENDPOINT = process.env.MEDIA_TAILOR_ENDPOINT || "https://abcxyz123.mediatailor.ap-south-1.amazonaws.com";
const EDGE_PRIVATE_KEY = "1234";

// Helper function to create HMAC for child manifest
function hmacCreationForChild(acl, EDGE_PRIVATE_KEY) {
    const hashSource = [];
    const exp = 'exp=' + (Math.floor(Date.now() / 1000) + 43200);  // 12 hours expiration
    const aclString = 'acl=' + acl;
    hashSource.push(exp);
    hashSource.push(aclString);
    const requestedToken = hashSource.join('~');

    const key = Buffer.from(EDGE_PRIVATE_KEY, 'hex');
    const hmacHash = crypto.createHmac('sha256', key).update(requestedToken).digest('hex');

    const childToken = `${exp}~${aclString}~hmac=${hmacHash}`;
    return childToken;
}

// Helper function to fetch data from a URL using the https module
function fetchData(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';

            // Accumulate the data chunks
            res.on('data', (chunk) => {
                console.log("==data1before value==>", data);
                data += chunk;
                console.log("==data1 value==>", data);
            });

            // When the response is complete
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(data);
                } else {
                    reject(new Error(`Request failed with status code ${res.statusCode}`));
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

export async function handler(event) {
    try {
        const record = event.Records[0];
        const request = record.cf.request;
        const path = request.uri;
        const queryString = request.querystring;
        const dummyUrl = 'https://dummy.com?' + queryString;
        const parsedUrl = new URL(dummyUrl);
        const originhostname = request.origin.custom.domainName;
        const shorttoken = parsedUrl.searchParams.get('shorttoken');
        const longtoken = parsedUrl.searchParams.get('longtoken');

        var anyBody = "path: " + path + "\n queryString: " + queryString + "\n  shorttoken: " + shorttoken + "\n longtoken: " + longtoken;
        // If 'shorttoken' token exists in the query string
        if (shorttoken) {
            const token = shorttoken;

            // Ensure the token has the expected structure with '~'
            if (!token || !token.includes('~')) {
                console.error(`Invalid token format: ${token}`);
                return {
                    status: "403",
                    body: "Invalid token format." + anyBody
                };
            }

            const aclPart = token.split('~')[1];
            if (!aclPart || !aclPart.includes('=')) {
                console.error(`Invalid acl format in token: ${token}`);
                return {
                    status: "403",
                    body: "Invalid acl format in token." + anyBody
                };
            }

            const acl = aclPart.split('=')[1];
            const childToken = hmacCreationForChild(acl, EDGE_PRIVATE_KEY);

            const mediaTailorURL = `${MEDIA_TAILOR_ENDPOINT}${path}`;

            try {
                const data = await fetchData(mediaTailorURL);
                let modifiedContent = '';
                const lines = data.split('\n');

                lines.forEach(line => {
                    if (line.includes('.m3u8?')) {
                        modifiedContent += line.replace(/\.m3u8\?/g, `.m3u8?longtoken=${childToken}&`) + '\n';
                    } else if (line.includes('.m3u8')) {
                        modifiedContent += line.replace(/\.m3u8/g, `.m3u8?longtoken=${childToken}`) + '\n';
                    } else {
                        modifiedContent += line + '\n';
                    }
                });
                var contentLength = Buffer.byteLength(modifiedContent, 'utf8');
                // Ensure the body is under CloudFront response size limit (40 KB)
                if (contentLength > 40 * 1024) {
                    return {
                        status: "413",
                        body: "Response body exceeds 40 KB size limit.",
                    };
                }
                return {
                    status: "200",
                    headers: {
                        "content-type": [
                            {
                                key: "Content-Type",
                                value: "application/vnd.apple.mpegurl"
                            }
                        ]
                    },
                    body: modifiedContent
                };

            } catch (error) {
                console.error(error);
                return {
                    status: "403",
                    body: error.message
                };
            }

        } else if (longtoken && path.includes('.m3u8')) {
            // Handle case where 'longtoken' exists and path contains '.m3u8'
            const mediaTailorURL = `${MEDIA_TAILOR_ENDPOINT}${path}`;
            try {
                const data = await fetchData(mediaTailorURL);

                let modifiedContent = '';
                const lines = data.split('\n');
                lines.forEach(line => {
                    if (line.includes('.ts')) {
                        modifiedContent += line.replace(/\.ts/g, `.ts?longtoken=${longtoken}&`) + '\n';
                    } else if (line.includes('.aac')) {
                        modifiedContent += line.replace(/\.aac/g, `.aac?longtoken=${longtoken}`) + '\n';
                    } else {
                        modifiedContent += line + '\n';
                    }
                });
                
                // Ensure the body is under CloudFront response size limit (40 KB)
                if (Buffer.byteLength(modifiedContent, 'utf8') > 40 * 1024) {
                    return {
                        status: "413",
                        body: "Response body exceeds 40 KB size limit.",
                    };
                }

                return {
                    status: "200",
                    headers: {
                        "content-type": [
                            {
                                key: "Content-Type",
                                value: "application/vnd.apple.mpegurl"
                            }
                        ]
                    },
                    body: modifiedContent
                };

            } catch (error) {
                console.error(error);
                return {
                    status: "403",
                    body: error.message
                };
            }
        } else {
            // Handle the case where neither 'shorttoken' nor 'longtoken' are present
            return {
                status: "403",
                body: 'Unauthorized access'
            };
        }
    } catch (error) {
        console.error(error);
        return {
            status: "500",
            body: JSON.stringify(error)
        };
    }
}
