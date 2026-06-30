
const tideCache = {};
const tideCache_temp = {};

async function getTideData_bak(obsCode, reqDate, time) {
    const req = reqDate.replaceAll('-', '');
    const cacheKey = `${obsCode}_${reqDate}`;
    const API_KEY = '27441bf5450704615e12175286ff5b62c526acc1bed6e9690d3fef6fc7e9102f';
    const url = `https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService?serviceKey=${API_KEY}&obsCode=${obsCode}&type=json&reqDate=${req}`;

    for (let attempt = 1; attempt <= 3; attempt++) {
    try {

        let items;

        // 첫 시도만 캐시 사용
        if (attempt === 1 && tideCache[cacheKey]) {
            console.log('조석 캐시 사용');
            items = tideCache[cacheKey];
        } else {
            console.log(`조석 API 호출 (${attempt}/3)`);

            const response = await fetch(url);
            const data = await response.json();
           
    
            if (!data?.body?.items?.item) {
                throw new Error('API 응답에 item이 없음');
            }

            items = data.body.items.item;
            console.log(items);

            // 정상 데이터면 캐시 갱신
            tideCache[cacheKey] = items;
        }

        items.sort((a, b) =>
            a.predcDt.localeCompare(b.predcDt)
        );

        const targetDate = new Date(`${reqDate}T${time}:00`);

        const nextTide = items.find(item =>
            new Date(item.predcDt.replace(' ', 'T')) > targetDate
        );

        const prevTide = [...items]
            .reverse()
            .find(item =>
                new Date(item.predcDt.replace(' ', 'T')) < targetDate
            );

        if (!prevTide || !nextTide) {
            throw new Error('만조/간조 데이터 찾기 실패');
        }

        return {
            prevTide: `${prevTide.predcDt.split(' ')[1]} (${prevTide.predcTdlvVl})`,
            nextTide: `${nextTide.predcDt.split(' ')[1]} (${nextTide.predcTdlvVl})`
        };

    } catch (e) {

        // 캐시가 문제일 가능성 있으니 제거
        delete tideCache[cacheKey];

        console.error(`조석정보 조회 실패 (${attempt}/3):`, e);

        if (attempt === 3) {
            return null;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }
}
}



// 만조/간조 구분용 유틸리티 함수
function getTideType(extrSe) {
    return (extrSe === '1' || extrSe === '3') ? "만조" : "간조";
}

async function getTideItems(obsCode, reqDate) {

    const req = reqDate.replaceAll('-', '');
    const cacheKey = `${obsCode}_${reqDate}`;
    const API_KEY = '27441bf5450704615e12175286ff5b62c526acc1bed6e9690d3fef6fc7e9102f';

    const url =
        `https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService?serviceKey=${API_KEY}&obsCode=${obsCode}&type=json&reqDate=${req}`;

    for (let attempt = 1; attempt <= 3; attempt++) {

        try {

            let items;

            if (attempt === 1 && tideCache[cacheKey]) {

                console.log('조석 캐시 사용');
                items = tideCache[cacheKey];

            } else {

                console.log(`조석 API 호출 (${attempt}/3)`);

                const response = await fetch(url);
                const data = await response.json();

                if (!data?.body?.items?.item) {
                    throw new Error('API 응답에 item이 없음');
                }

                items = data.body.items.item;

                tideCache[cacheKey] = items;
            }

            return items;

        } catch (e) {

            delete tideCache[cacheKey];

            console.error(`조석정보 조회 실패 (${attempt}/3):`, e);

            if (attempt === 3) {
                return null;
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}

function getNearestTide(items, reqDate, time) {

    items.sort((a, b) =>
        a.predcDt.localeCompare(b.predcDt)
    );

    const targetDate =
        new Date(`${reqDate}T${time}:00`);

    const nextTide = items.find(item =>
        new Date(item.predcDt.replace(' ', 'T')) > targetDate
    );

    const prevTide = [...items]
        .reverse()
        .find(item =>
            new Date(item.predcDt.replace(' ', 'T')) < targetDate
        );

      if (!prevTide && !nextTide) {
        throw new Error('만조/간조 데이터 찾기 실패');
    }

    return {
        prevTide: prevTide
            ? `${prevTide.predcDt.split(' ')[1]} (${prevTide.predcTdlvVl})`
            : null,

        nextTide: nextTide
            ? `${nextTide.predcDt.split(' ')[1]} (${nextTide.predcTdlvVl})`
            : null
    };
}

async function getTideData(obsCode, reqDate, time) {

    const items =
        await getTideItems(obsCode, reqDate);

    if (!items) {
        return null;
    }

    let tideInfo =
        getNearestTide(items, reqDate, time);

    // nextTide가 없으면 다음날 조회
    if (tideInfo.nextTide === null) {

        const tomorrow = new Date(reqDate);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const tomorrowDate =
            tomorrow.toISOString().split('T')[0];

        const tomorrowItems =
            await getTideItems(obsCode, tomorrowDate);

        if (tomorrowItems?.length) {

            const firstTide =
                tomorrowItems.sort((a, b) =>
                    a.predcDt.localeCompare(b.predcDt)
                )[0];

            tideInfo.nextTide =
                `${firstTide.predcDt.split(' ')[1]} (${firstTide.predcTdlvVl})`;
        }
    }

    if (tideInfo.prevTide === null) {

        const yesterday = new Date(reqDate);
        yesterday.setDate(yesterday.getDate() - 1);

        const yesterdayDate =
            yesterday.toISOString().split('T')[0];

        const yesterdayItems =
            await getTideItems(obsCode, yesterdayDate);

        if (yesterdayItems?.length) {

            const lastTide =
                [...yesterdayItems]
                    .sort((a, b) =>
                        a.predcDt.localeCompare(b.predcDt)
                    )
                    .pop();

            tideInfo.prevTide =
                `${lastTide.predcDt.split(' ')[1]} (${lastTide.predcTdlvVl})`;
        }
    }
    
    return tideInfo;
}


async function getWaterTemp_bak(obsCode, reqDate, time) {

    const req = reqDate.replaceAll('-', '');

    const API_KEY =
        '27441bf5450704615e12175286ff5b62c526acc1bed6e9690d3fef6fc7e9102f';

    const url =
        `https://apis.data.go.kr/1192136/surveyWaterTemp/GetSurveyWaterTempApiService` +
        `?serviceKey=${API_KEY}` +
        `&type=json` +
        `&obsCode=${obsCode}` +
        `&reqDate=${req}` +
        `&min=60` +
        `&numOfRows=24` +
        `&include=obsvtrNm,obsrvnDt,wtem`;

    try {

        const response = await fetch(url);
        const data = await response.json();

        const items = data?.body?.items?.item;
        

        if (!items?.length) {
            throw new Error('수온 데이터 없음');
        }

        items.sort((a, b) =>
            a.obsrvnDt.localeCompare(b.obsrvnDt)
        );

        const [hour, minute] = time.split(':');

        const targetDate = new Date(
            Number(req.substring(0, 4)),
            Number(req.substring(4, 6)) - 1,
            Number(req.substring(6, 8)),
            Number(hour),
            Number(minute)
        );
        


        const tempData = [...items]
            .reverse()
            .find(item =>
                new Date(item.obsrvnDt.replace(' ', 'T')) <= targetDate
            );

        if (!tempData) {
            throw new Error('해당 시간 이전 수온 데이터 없음');
        }

        return tempData.wtem;

    } catch (e) {

        console.error('수온 조회 실패:', e);

        return null;
    }
}

async function getWaterTemp_a(obsCode, reqDate, time) {

    const req = reqDate.replaceAll('-', '');
    const cacheKey = `${obsCode}_${reqDate}`;

    const API_KEY =
        '27441bf5450704615e12175286ff5b62c526acc1bed6e9690d3fef6fc7e9102f';

    const url =
        `https://apis.data.go.kr/1192136/surveyWaterTemp/GetSurveyWaterTempApiService` +
        `?serviceKey=${API_KEY}` +
        `&type=json` +
        `&obsCode=${obsCode}` +
        `&reqDate=${req}` +
        `&min=60` +
        `&numOfRows=24` +
        `&include=obsvtrNm,obsrvnDt,wtem`;

    for (let attempt = 1; attempt <= 3; attempt++) {

        try {

            let items;

            // 첫 시도만 캐시 사용
            if (attempt === 1 && tideCache_temp[cacheKey]) {

                console.log('수온 캐시 사용');

                items = tideCache_temp[cacheKey];

            } else {

                console.log(`수온 API 호출 (${attempt}/3)`);

                const response = await fetch(url);
                const data = await response.json();

                items = data?.body?.items?.item;

                if (!items?.length) {
                    throw new Error('수온 데이터 없음');
                }

                // 정상 데이터면 캐시 갱신
                tideCache_temp[cacheKey] = items;
            }

            items.sort((a, b) =>
                a.obsrvnDt.localeCompare(b.obsrvnDt)
            );

            const [hour, minute] = time.split(':');

            const targetDate = new Date(
                Number(req.substring(0, 4)),
                Number(req.substring(4, 6)) - 1,
                Number(req.substring(6, 8)),
                Number(hour),
                Number(minute)
            );

            const tempData = [...items]
                .reverse()
                .find(item =>
                    new Date(item.obsrvnDt.replace(' ', 'T')) <= targetDate
                );

            if (!tempData) {
                throw new Error('해당 시간 이전 수온 데이터 없음');
            }

            return tempData.wtem;

        } catch (e) {

            // 캐시가 문제일 수 있으니 제거
            delete tideCache_temp[cacheKey];

            console.error(
                `수온 조회 실패 (${attempt}/3):`,
                e
            );

            if (attempt === 3) {
                return null;
            }

            await new Promise(resolve =>
                setTimeout(resolve, 500)
            );
        }
    }
}


async function getWaterTemp_b(obsCode, reqDate, time) {

    const req = reqDate.replaceAll('-', '');
    const cacheKey = `${obsCode}_${reqDate}`;

    const API_KEY =
        '27441bf5450704615e12175286ff5b62c526acc1bed6e9690d3fef6fc7e9102f';

    const url =
        `https://apis.data.go.kr/1192136/twRecent/GetTWRecentApiService` +
        `?serviceKey=${API_KEY}` +
        `&type=json` +
        `&obsCode=${obsCode}` +
        `&reqDate=${req}` +
        `&min=60` +
        `&numOfRows=24` +
        `&include=obsvtrNm,obsrvnDt,wtem`;



    for (let attempt = 1; attempt <= 3; attempt++) {

        try {

            let items;

            // 첫 시도만 캐시 사용
            if (attempt === 1 && tideCache_temp[cacheKey]) {

                console.log('수온 캐시 사용');

                items = tideCache_temp[cacheKey];

            } else {

                console.log(`수온 API 호출 (${attempt}/3)`);

                const response = await fetch(url);
                const data = await response.json();

                items = data?.body?.items?.item;

                if (!items?.length) {
                    throw new Error('수온 데이터 없음');
                }

                // 정상 데이터면 캐시 갱신
                tideCache_temp[cacheKey] = items;
            }

            items.sort((a, b) =>
                a.obsrvnDt.localeCompare(b.obsrvnDt)
            );

            const [hour, minute] = time.split(':');

            const targetDate = new Date(
                Number(req.substring(0, 4)),
                Number(req.substring(4, 6)) - 1,
                Number(req.substring(6, 8)),
                Number(hour),
                Number(minute)
            );

            const tempData = [...items]
                .reverse()
                .find(item =>
                    new Date(item.obsrvnDt.replace(' ', 'T')) <= targetDate
                );



            return tempData.wtem;

        } catch (e) {

            // 캐시가 문제일 수 있으니 제거
            delete tideCache_temp[cacheKey];

            console.error(
                `수온 조회 실패 (${attempt}/3):`,
                e
            );

            if (attempt === 3) {
                return null;
            }

            await new Promise(resolve =>
                setTimeout(resolve, 500)
            );
        }
    }
}


async function getWaterTemp_c(obsCode, time) {
    
    
    const API_KEY =
        'qPwOeIrU-2606-VYGMOO-1638';

    const url =
        `https://www.nifs.go.kr/api/OpenAPI_json?id=risaList&key=` +
        `${API_KEY}`;


    for (let attempt = 1; attempt <= 3; attempt++) {

        try {

            let items;

            // 첫 시도만 캐시 사용
            if (attempt === 1 && tideCache_temp[cacheKey]) {

                console.log('수온 캐시 사용');

                items = tideCache_temp[cacheKey];

            } else {

                console.log(`수온 API 호출 (${attempt}/3)`);

                const response = await fetch(url);
                const data = await response.json();

                items = data?.body?.items?.item;

                if (!items?.length) {
                    throw new Error('수온 데이터 없음');
                }

                for (const item of items){
                    if(item.sta_cde == obsCode && item.obs_lay == '1'){
                        console.log(item.wtr_tmp)                        
                        return item.wtr_tmp;
                    }
                }
                
                // 정상 데이터면 캐시 갱신
                tideCache_temp[cacheKey] = items;
            }


            

        } catch (e) {

            // 캐시가 문제일 수 있으니 제거
            delete tideCache_temp[cacheKey];

            console.error(
                `수온 조회 실패 (${attempt}/3):`,
                e
            );

            if (attempt === 3) {
                return null;
            }

            await new Promise(resolve =>
                setTimeout(resolve, 500)
            );
        }
    }
}
