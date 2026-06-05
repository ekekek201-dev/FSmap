// api-tide.js

const API_KEY = '27441bf5450704615e12175286ff5b62c526acc1bed6e9690d3fef6fc7e9102f';
const BASE_URL = 'https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService';

export async function getTideData(obsCode) {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `tide_${obsCode}_${today}`;

    // 1. 캐시 확인 (오늘 데이터가 있으면 바로 반환)
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        return JSON.parse(cachedData);
    }

    // 2. API 호출
    try {
        const url = `${BASE_URL}?serviceKey=${API_KEY}&obsCode=${obsCode}&resultType=json`;
        const response = await fetch(url);
        const data = await response.json();

        // 3. API 응답에서 필요한 데이터만 파싱
        // (국립해양조사원 API 구조에 맞춰 만조/간조 데이터를 추출합니다)
        const tideInfo = {
            low: data.result.data[0].lvl, // 예시 경로, 실제 데이터 구조 확인 후 수정 필요
            high: data.result.data[1].lvl
        };

        // 4. 캐시 저장
        localStorage.setItem(cacheKey, JSON.stringify(tideInfo));
        return tideInfo;
        
    } catch (error) {
        console.error("물때 데이터 로드 실패:", error);
        return null;
    }
}
