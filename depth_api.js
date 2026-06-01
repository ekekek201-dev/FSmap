/**
 * 🌊 [api-depth.js] 국립 수심 데이터 open API 연동 모듈 (v1.1 - 다중 마커 지원)
 */

 const DEPTH_API_SERVICE_KEY = "27441bf5450704615e12175286ff5b62c526acc1bed6e9690d3fef6fc7e9102f";

 /**
  * 지구 곡면 기준 두 좌표 간의 직선 거리(km)를 구하는 하버사인 함수
  */
 function getDepthGeoDistance(lat1, lng1, lat2, lng2) {
     const R = 6371; 
     const dLat = (lat2 - lat1) * Math.PI / 180;
     const dLng = (lng2 - lng1) * Math.PI / 180;
     const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) * Math.sin(dLng / 2);
     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
     return R * c;
 }
 
 /**
  * 💡 클릭한 위도, 경도를 받아 사각형 검색 범위를 계산한 후 수심 API를 호출하는 핵심 함수
  * @param {number} clickLat - 클릭한 곳의 위도
  * @param {number} clickLng - 클릭한 곳의 경도
  * @param {Function} callback - 결과를 리턴받을 콜백 함수
  */
 function getOceanDepthData(clickLat, clickLng, callback) {
     console.log(`🌐 [api-depth.js] 수심 검색 시작 -> 위도: ${clickLat}, 경도: ${clickLng}`);
 
     // 📐 [300m 반경 커버] 클릭 지점 기준 약 전방 300m 박스권 생성 (위경도 오차 보정값 소수점 5자리 절삭)
     const ymin = (clickLat - 0.0015).toFixed(5);
     const ymax = (clickLat + 0.0015).toFixed(5);
     const xmin = (clickLng - 0.0015).toFixed(5);
     const xmax = (clickLng + 0.0015).toFixed(5);
 
     const API_URL = `https://apis.data.go.kr/1192136/waterDepth/GetWaterDepthApiService?serviceKey=${DEPTH_API_SERVICE_KEY}&type=json&ymin=${ymin}&ymax=${ymax}&xmin=${xmin}&xmax=${xmax}`;
 
     fetch(API_URL, { method: 'GET', headers: { 'accept': '*/*' } })
         .then(response => response.json())
         .then(data => {
             if (!data || !data.header) {
                 return callback({ success: false, code: 99, msg: "기타에러 (응답없음)" });
             }
 
             const resCode = data.header.resultCode;
             if (resCode !== "00") {
                 if (resCode === "03" || data.header.resultMsg.includes("NO_DATA")) {
                     return callback({ success: false, code: 3, msg: "데이터 없음" });
                 } else if (resCode === "10") {
                     return callback({ success: false, code: 10, msg: "잘못된 요청 파라메터" });
                 } else if (resCode === "11") {
                     return callback({ success: false, code: 11, msg: "필수요청 파라메터 없음" });
                 } else {
                     return callback({ success: false, code: 99, msg: "기타에러 (" + data.header.resultMsg + ")" });
                 }
             }
 
             const body = data.body;
             if (!body || !body.items || !body.items.item || body.items.item.length === 0) {
                 return callback({ success: false, code: 3, msg: "검색 범위 내 수심 데이터 없음" });
             }
 
             // 배열 예외 처리 규격화
             const items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
             
             let closestItem = null;
             let minDistance = Infinity;
             
             // 전체 목록 정제 (주변 300m 전체 매핑용 데이터셋 구성)
             const allPoints = items.map(item => {
                 const itemLng = item.lot || item.lng;
                 return {
                     lat: item.lat,
                     lng: itemLng,
                     dpwt: parseFloat(item.dpwt).toFixed(1) + " m"
                 };
             });
 
             // 🎯 [최단거리 연산] 내 포인트용 타겟팅 하나 솎아내기
             items.forEach(item => {
                 const itemLng = item.lot || item.lng; 
                 const dist = getDepthGeoDistance(clickLat, clickLng, item.lat, itemLng);
                 if (dist < minDistance) {
                     minDistance = dist;
                     closestItem = item;
                 }
             });
 
             if (closestItem && closestItem.dpwt !== undefined) {
                 callback({
                     success: true,
                     code: 200,
                     depth: parseFloat(closestItem.dpwt).toFixed(1) + " m",
                     distMeter: (minDistance * 1000).toFixed(0),
                     rawItems: allPoints // 🌟 [핵심] 주변 모든 격자 수심 포인트를 통째로 담아서 반환!
                 });
             } else {
                 callback({ success: false, code: 3, msg: "유효한 수심 데이터 포맷 부족" });
             }
         })
         .catch(err => {
             console.error("수심 API 통신 오류:", err);
             callback({ success: false, code: 99, msg: "기타에러 (네트워크/CORS)" });
         });
 }