function findNearest(lat, lng) {
    let minDistance = Infinity;
    let nearest = null;

    stations.forEach(s => {
        // 거리 계산 (피타고라스 정리 이용)
        // 위도/경도 간의 거리이므로 실제 미터 단위는 아니지만, 
        // 단순히 '가까운 순서'를 찾을 때는 이 정도로 충분합니다.
        const dx = parseFloat(s.lat) - lat;
        const dy = parseFloat(s.lot) - lng;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < minDistance) {
            minDistance = distance;
            nearest = s;
        }
    });
    return nearest;
}



// 웹 브라우저에서는 별도의 import 없이 그냥 fetch를 쓰면 됩니다.
async function getTideData(obsCode, reqDate) {
    const API_KEY = '27441bf5450704615e12175286ff5b62c526acc1bed6e9690d3fef6fc7e9102f';
    const url = `https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService?serviceKey=${API_KEY}&obsCode=${obsCode}&resultType=json&baseDt=${reqDate}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        const items = data.body.items.item;

        // 정렬
        items.sort((a, b) => a.predcDt.localeCompare(b.predcDt));

        // 현재 시간 (테스트를 위해 임의 시간을 넣었지만, 실제 서비스할 땐 new Date() 사용)
        const now = new Date('2026-06-05T15:30:00'); 
        
        const nextTide = items.find(item => new Date(item.predcDt) > now);
        const prevTide = [...items].reverse().find(item => new Date(item.predcDt) < now);

        return { prevTide, nextTide };
    } catch (e) {
        console.error("물때 정보 불러오기 실패:", e);
        return null;
    }
}

// 만조/간조 구분용 유틸리티 함수
function getTideType(extrSe) {
    return (extrSe === '1' || extrSe === '3') ? "만조" : "간조";
}
