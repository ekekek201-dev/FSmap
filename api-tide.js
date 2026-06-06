
const tideCache = {};

async function getTideData(obsCode, reqDate, time) {
    const req = reqDate.replaceAll('-', '');
    const cacheKey = `${obsCode}_${reqDate}`;
    const API_KEY = '27441bf5450704615e12175286ff5b62c526acc1bed6e9690d3fef6fc7e9102f';
    const url = `https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService?serviceKey=${API_KEY}&obsCode=${obsCode}&type=json&reqDate=${req}`;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            
            let items;

            if (tideCache[cacheKey]) {
                console.log('조석 캐시 사용');
                items = tideCache[cacheKey];
            } else {
                console.log('조석 API 호출');

                const response = await fetch(url);
                const data = await response.json();

                if (!data?.body?.items?.item) {
                    throw new Error('API 응답에 item이 없음');
                }

                items = data.body.items.item;

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
            //console.log(prevTide);
            return {
                prevTide: `${prevTide.predcDt.split(' ')[1]} (${prevTide.predcTdlvVl})`,
                nextTide: `${nextTide.predcDt.split(' ')[1]} (${nextTide.predcTdlvVl})`
            };

        } catch (e) {
            console.error(`조석정보 조회 실패 (${attempt}/3):`, e);

            if (attempt === 3) {
                console.error("물때 정보 불러오기 최종 실패");
                return null;
            }

            // 0.5초 대기 후 재시도
            await new Promise(resolve => setTimeout(resolve, 1));
        }
    }
}

// 웹 브라우저에서는 별도의 import 없이 그냥 fetch를 쓰면 됩니다.
async function getTideData2(obsCode, reqDate,time) {
    req = reqDate.replaceAll('-', '');
    const API_KEY = '27441bf5450704615e12175286ff5b62c526acc1bed6e9690d3fef6fc7e9102f';
    const url = `https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService?serviceKey=${API_KEY}&obsCode=${obsCode}&type=json&reqDate=${req}`;
    console.log(time);
    try {
        const response = await fetch(url);
        const data = await response.json();
        const items = data.body.items.item;

        // 정렬
        items.sort((a, b) => a.predcDt.localeCompare(b.predcDt));

              
        const targetDate = new Date(`${reqDate}T${time}:00`);

        const nextTide = items.find(item =>
            new Date(item.predcDt.replace(' ', 'T')) > targetDate
        );

        const prevTide = [...items]
            .reverse()
            .find(item =>
                new Date(item.predcDt.replace(' ', 'T')) < targetDate
            );
        //console.log("prevTide:", prevTide.predcDt.split(' ')[1]);
        //console.log("nextTide:", nextTide.predcDt.split(' ')[1]); 
        console.log(prevTide);
        return { prevTide: `${prevTide.predcDt.split(' ')[1]} (${prevTide.predcTdlvVl})`, nextTide: `${nextTide.predcDt.split(' ')[1]} (${nextTide.predcTdlvVl})` };

    } catch (e) {
        console.error("물때 정보 불러오기 실패:", e);
        return null;
    }
}

// 만조/간조 구분용 유틸리티 함수
function getTideType(extrSe) {
    return (extrSe === '1' || extrSe === '3') ? "만조" : "간조";
}
