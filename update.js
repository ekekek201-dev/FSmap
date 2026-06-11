const axios = require('axios');
const fs = require('fs');

const apiKey_nifs_1 = process.env.API_KEY_1; //실시간
const apiKey = process.env.API_KEY;
let stationCodes = ['DT_0020','DT_0021','DT_0022','DT_0023','DT_0024'];
const now = new Date(
    new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Seoul'
    })
);

if (!fs.existsSync('./data/temp')) {
    fs.mkdirSync('./data/temp', { recursive: true });
}

const resultFile =
    `data/temp/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.json`;


const failed = [];


const coords = JSON.parse( //관측소코드 불러오기
    fs.readFileSync('./coords.json', 'utf8')
);



async function fetchStationData_api_a() { 

    console.log("api_a 데이터 수집 시작...");

    let results = {};

    if (fs.existsSync(resultFile)) {
        try {
            const content = fs.readFileSync(resultFile, 'utf8');
            if (content.trim()) {
                results = JSON.parse(content);
            }
        } catch (err) {
            console.error('result.json 읽기 실패:', err.message);
        }
    }

    const batchSize = 10;

    for (let i = 0; i < stationCodes.length; i += batchSize) {

        const batch = stationCodes.slice(i, i + batchSize);

        const responses = await Promise.all(
            batch.map(async (code) => {

                const url =
                    `https://apis.data.go.kr/1192136/surveyWaterTemp/GetSurveyWaterTempApiService` +
                    `?serviceKey=${apiKey}` +
                    `&type=json` +
                    `&obsCode=${code}` +
                    `&min=60` +
                    `&numOfRows=24`;
                    
                const response = await axios.get(url);

                return {
                    code,
                    data: response.data
                };
            })
        );

        for (const res of responses) {

            const code = res.code;
            const data = res.data;

            if (data.header.resultCode === '00') {

                const tempData = [];

                for (const item of data.body.items.item) {
                    tempData.push({
                        time: item.obsrvnDt.slice(11, 16),
                        temp: item.wtem
                    });
                    //console.log(`성공: ${item.obsvtrNm}`);
                }
                console.log(`성공: ${code} ${data.body.items.item[0].obsvtrNm}`);
                results[code] = tempData;
                
            }else{
                console.log(`실패: ${code} ${data.header.resultCode} ${data.header.resultMsg}`);
                failed.push(code);
        }
        }
    }
    console.log(failed);
    fs.writeFileSync(
        resultFile,
        JSON.stringify(results, null, 2)
    );

    console.log("완료!");
}

async function fetchStationData_api_b() { 

    console.log("api_b 데이터 수집 시작...");

    let results = {};

    if (fs.existsSync(resultFile)) {
        try {
            const content = fs.readFileSync(resultFile, 'utf8');
            if (content.trim()) {
                results = JSON.parse(content);
            }
        } catch (err) {
            console.error('result.json 읽기 실패:', err.message);
        }
    }

    const batchSize = 10;

    for (let i = 0; i < stationCodes.length; i += batchSize) {

        const batch = stationCodes.slice(i, i + batchSize);

        const responses = await Promise.all(
            batch.map(async (code) => {

                const url = `https://apis.data.go.kr/1192136/twRecent/GetTWRecentApiService?serviceKey=${apiKey}&numOfRows=24&obsCode=${code}&min=60&type=json`;
                
                    
                const response = await axios.get(url);

                return {
                    code,
                    data: response.data
                };
            })
        );

        for (const res of responses) {

            const code = res.code;
            const data = res.data;

            if (data.header.resultCode === '00') {

                const tempData = [];

                for (const item of data.body.items.item) {
                    tempData.push({
                        time: item.obsrvnDt.slice(11, 16),
                        temp: item.artmp
                    });
                    //console.log(`성공: ${item.obsvtrNm}`);
                }
                console.log(`성공: ${code} ${data.body.items.item[0].obsvtrNm}`);
                results[code] = tempData;
                
            }else{
                console.log(`실패: ${code} ${data.header.resultCode} ${data.header.resultMsg}`);
                failed.push(code);
        }
        }
    }
    console.log(failed);
    fs.writeFileSync(
        resultFile,
        JSON.stringify(results, null, 2)
    );

    console.log("완료!");
}

async function fetchStationData_api_c() {
    console.log("api_c 데이터 수집 시작...");
    
    let results = {};

    if (fs.existsSync(resultFile)) {
        try {
            const content = fs.readFileSync(resultFile, 'utf8');

            if (content.trim()) {
                results = JSON.parse(content);
            }
        } catch (err) {
            console.error('result.json 읽기 실패:', err.message);
        }
    }
    //const url = `https://www.nifs.go.kr/api/OpenAPI_json?id=risaCode&key=${apiKey_nifs_1}`;
    const url = `https://www.nifs.go.kr/api/OpenAPI_json?id=risaList&key=${apiKey_nifs_1}`
    const response = await axios.get(url);
    const data = response.data;
    
    try{
    if(data.header.resultCode == '00'){
        
        const items = data.body.item;
        
        for (const item of items){
            console.log(`성공: ${item.sta_cde}`);
            if (!results[item.sta_cde]) {
                results[item.sta_cde] = [];
            }
            if (item.obs_lay == '1'){
                            results[item.sta_cde].push({
                time: item.obs_tim.slice(0, -3),
                temp: item.wtr_tmp               
            });
            }

        
        }
    }else{
        console.log(`실패 ${data.header.resultCode} ${data.header.resultMsg}`);
    }

    fs.writeFileSync(
    resultFile,
    JSON.stringify(results, null, 2)
    );
    console.log("완료! results.json 파일이 생성되었습니다.");
}catch (err){console.log(err);}
}


async function main() {
    stationCodes = coords
        .filter(item => item.type === 'api_a')
        .map(item => item.code);
    await fetchStationData_api_a();

        stationCodes = coords
        .filter(item => item.type === 'api_b')
        .map(item => item.code);
    await fetchStationData_api_b();
    await fetchStationData_api_c();


}

main();
