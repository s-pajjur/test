

var crypto = require('crypto');
var querystring_module  = require('querystring');

String.prototype.rsplit = function(sep, maxsplit) {
    var split = this.split(sep);
    return maxsplit ? [ split.slice(0, -maxsplit).join(sep) ].concat(split.slice(-maxsplit)) : split;
}


function hmac_validation(token, EDGE_PRIVATE_KEY){
    var hashSrc = token.rsplit('~', 1)[0];
    var sha256_request = token.rsplit('~', 1)[1];
    sha256_request = sha256_request.split('=')[1];
    sha256_request = sha256_request.split('&')[0];
    var value = crypto.createHmac('sha256',  String.bytesFrom(EDGE_PRIVATE_KEY, 'hex') ).update(hashSrc).digest('hex');
    return (value == sha256_request) ? true : false;
}
    
function handler(event) {
    console.log(event);
    var EDGE_PRIVATE_KEY = "1234";
    var currentTime = Math.floor((new Date()).getTime() / 1000);
    var request = event['request'];
    var headers = request['headers'];
    
    var status, queryString1;
    var response = {
        "statusCode": 403,
        "statusDescription": 'Access Denied',
        // 'body': "Access Denied",
        'headers': {
            'content-type': {
                'value': 'text/html'
            }
        }
    };
    
    queryString1 = request['querystring'];
    
    if (Object.keys(queryString1).length === 0){
        console.log(JSON.stringify(event));
        console.log('access denied as token absent in querystring');
        return response;
    } else {
        var expires = 0;
        var token = "";
        if (queryString1.hasOwnProperty('shorttoken')) {
            
            var token = queryString1["shorttoken"]['value'];
            var expires = token.match(/exp=(\d+)/)[1];
            
            if (currentTime <= parseInt(expires)) {

                status = hmac_validation(token, EDGE_PRIVATE_KEY);
                if (status == true) {
                    console.log("request status success.....");
                    return request;
                } else {

                    console.log(JSON.stringify(event));
                    console.log ('Error!!! redirecting to error page... due to token didnt match');
                    return response;
                }

            } else {

                console.log('Access Denied as Token Expired ');
                return response;
            }
                

        } else if (queryString1.hasOwnProperty('longtoken')) {

            var token = queryString1["longtoken"]['value'];
            var expires = token.match(/exp=(\d+)/)[1];
            headers = request['headers'];
            
            if (currentTime <= parseInt(expires)){

                    status = hmac_validation(token, EDGE_PRIVATE_KEY);
                if (status == true){
                    console.log ('Success.');
                    return request;
                }else {

                    console.log ('Error!!! redirecting to error page... due to token didnt match');
                    return response;
                }
                    

            } else {
                console.log('Access Denied as Token Expired ');
                return response;

            }
                
        } else {
            console.log('Access Denied');
            return response;
        }               
    
            
    } 
            
} 
        
