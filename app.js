// =================================================================
// 🗺️ 카카오 지도 생성 및 하이브리드 위성 세팅

// 1. 기본 좌표 설정
var defaultLat = 36.495;
var defaultLng = 129.445;

var container = document.getElementById('map');
var options = {
    center: new kakao.maps.LatLng(defaultLat, defaultLng),
    level: 3,
    mapTypeId : kakao.maps.MapTypeId.HYBRID 
};
var map = new kakao.maps.Map(container, options);
var geocoder = new kakao.maps.services.Geocoder();

// 2. [수정] 지도가 완전히 로딩된 후(idle 상태)에 위치 조회 시도
// 'idle' 이벤트는 지도 이동, 확대/축소 등 모든 동작이 멈춘 상태를 의미합니다.
kakao.maps.event.addListener(map, 'idle', function() {
    // 한 번만 실행되도록 체크
    if (window.hasLocated) return; 
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                var lat = position.coords.latitude;
                var lng = position.coords.longitude;
                var locPosition = new kakao.maps.LatLng(lat, lng);
                
                map.setCenter(locPosition); // 지도 중심 이동
                updateMyLocationMarker(lat, lng); // 마커 표시 업데이트
                window.hasLocated = true; // 위치 이동 완료 플래그
            },
            function(error) {
                console.log("위치 조회 실패, 기본 좌표를 유지합니다.");
            },
            {
                enableHighAccuracy: true, // 정밀도 높임
                timeout: 5000,           // 5초 타임아웃
                maximumAge: 0
            }
        );
    }
});
// 전역 관리 변수들
var isRegisterMode = false;
var currentMarker = null;
var currentInfoWindow = null;
var fishingPointsDataset = []; 
var tempCoords = ""; 
var myLocationMarker = null; // 내 위치 마커를 담을 변수
// 수심 숫자 레이어들을 모아둘 메모리 배열
var depthTextOverlays = []; 

// 수심 조회를 위해 클릭 시점의 원본 위경도 좌표 임시 보관소
var lastClickLat = 0;
var lastClickLng = 0;

// =================================================================
// 🎨 [대표님 기획 지시사항] 어종별 커스텀 이미지 마커 스펙 정의 파트
// =================================================================
// 💡 대표님! 나중에 쏨뱅이, 붉바리 등의 전용 물고기 도안(PNG)이 나오면 아래 URL 주소만 수정하시면 됩니다.
// 현재는 구분을 위해 시스템에서 제공하는 서로 다른 색상/모양의 마커 아이콘들로 정밀 매핑해 두었습니다.
var FISH_MARKER_MAP = {
    "쏨뱅이": "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png",       // 노란 별 모양
    "붉바리": "https://maps.google.com/mapfiles/ms/icons/red-dot.png",                        // 구글 레핀
    "볼락": "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",                       // 구글 블루핀
    "농어": "https://maps.google.com/mapfiles/ms/icons/green-dot.png",                      // 구글 그린핀
    "기본": "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/mini_circle.png"      // 드롭다운 외 직접입력 기본 미니 마커
};

// 마커 사이즈 및 규격 정의
var MARKER_WIDTH = 24;
var MARKER_HEIGHT = 35;
var OFFSET_X = 12;
var OFFSET_Y = 35;

// =================================================================
// 📍 포인트 등록 모드 토글 함수
// =================================================================
function toggleRegisterMode() {
    var regBtn = document.getElementById('reg-btn');
    var pointer = document.getElementById('pointer');
    
    if (isRegisterMode === false) {
        closeListSidebar();
        isRegisterMode = true;
        regBtn.classList.add('active'); 
        regBtn.innerText = "🛑 조준 중... (지도 클릭)";
        pointer.style.display = "block";
    } else {
        isRegisterMode = false;
        regBtn.classList.remove('active'); 
        regBtn.innerText = "📍 포인트 등록";
        pointer.style.display = "none";
    }
}

// =================================================================
// 🎯 카카오 지도 클릭 감시 (조준 폼 출력)
// =================================================================
kakao.maps.event.addListener(map, 'click', function(mouseEvent) {
    if (isRegisterMode === false) return; 

    if (currentInfoWindow) currentInfoWindow.close();

    var centerLatLng = map.getCenter();
    lastClickLat = centerLatLng.getLat();
    lastClickLng = centerLatLng.getLng();
    
    // 조준 중일 때 지도 중심에 임시로 띄워둘 기본 마커 설정
    var markerImage = new kakao.maps.MarkerImage(
        FISH_MARKER_MAP["기본"], 
        new kakao.maps.Size(12, 12), 
        { offset: new kakao.maps.Point(6, 6) }
    );

    currentMarker = new kakao.maps.Marker({ 
        position: centerLatLng,
        image: markerImage 
    });
    currentMarker.setMap(map);

    tempCoords = `${lastClickLat.toFixed(4)}, ${lastClickLng.toFixed(4)}`;

    var now = new Date();
    var currentDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; 
    var currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;        

    geocoder.coord2RegionCode(lastClickLng, lastClickLat, function(result, status) {
        var addressName = (status === kakao.maps.services.Status.OK && result[0]) ? result[0].address_name : "알 수 없는 지역";

        // 🌟 [대표님 지시: 어종 선택 콤보박스 디자인 탑재]
        var formContent = `
            <div class="info-form">
                <h4>🎣 포인트 정보 입력 (v1.2 어종커스텀)</h4>
                <div class="info-row"><span>장소</span><input type="text" id="p-pos" value="${addressName}" readonly></div>
                <div class="info-row"><span>좌표</span><input type="text" value="${tempCoords}" readonly style="color:#888;"></div>
                <div class="info-row"><span>날짜</span><input type="date" id="p-date" value="${currentDateStr}"></div>
                <div class="info-row"><span>시간</span><input type="time" id="p-time" value="${currentTimeStr}"></div>
                <div class="info-row"><span>수심</span><input type="text" id="p-depth" placeholder="예: 7.5 (직접 작성)" style="font-weight:bold; color:#007BFF;"></div>
                
                <div class="info-row" style="background:#f8fafc; padding:6px; border-radius:6px; border:1px dashed #cbd5e1; margin-bottom:8px;">
                    <span style="color:#0f172a; font-size:12px;">🌊 수심확인 (300m 전자해도 번호 표기)</span>
                    <input type="checkbox" id="p-depth-check" style="width:18px; height:18px; cursor:pointer;" checked>
                </div>
                
                <div class="info-row"><span>물때</span><input type="text" id="p-tide" placeholder="물때 정보 입력"></div>
                <div class="info-row"><span>수온</span><input type="text" id="p-temp-real" placeholder="수온 정보 입력"></div>
                
                <div class="info-row">
                    <span>어종</span>
                    <div class="fish-combo-box">
                        <input type="text" id="p-fish" placeholder="어종을 입력하거나 선택하세요.">
                        <select id="p-fish-select" onchange="syncFishDropdown()">
                            <option value="">직접입력</option>
                            <option value="쏨뱅이">쏨뱅이</option>
                            <option value="붉바리">붉바리</option>
                            <option value="볼락">볼락</option>
                            <option value="농어">농어</option>
                        </select>
                    </div>
                </div>

                <div class="info-row"><span>태클</span><input type="text" id="p-tackle" placeholder="채비 입력"></div>
                <div class="info-row"><span>기타</span><input type="text" id="p-memo" placeholder="기타 메모"></div>
                <div class="btn-group">
                    <button class="form-btn btn-submit" onclick="saveFishingPoint()">등록</button>
                    <button class="form-btn btn-cancel" onclick="cancelFishingPoint()">취소</button>
                </div>
            </div>
        `;

        currentInfoWindow = new kakao.maps.InfoWindow({ content: formContent, removable: false });
        currentInfoWindow.open(map, currentMarker);
    });

    toggleRegisterMode();
});

// 🔄 드롭다운에서 어종을 고르면 텍스트 칸에 글자가 자동으로 꽂히는 연동 함수
function syncFishDropdown() {
    var selectElement = document.getElementById('p-fish-select');
    var inputElement = document.getElementById('p-fish');
    if (selectElement.value !== "") {
        inputElement.value = selectElement.value;
    }
}

// =================================================================
// 💾 데이터 세이브 및 [지능형 수심 숫자 누적 + 🐟어종 마커 가공] 엔진
// =================================================================
function saveFishingPoint() {
    var finalAddress = document.getElementById('p-pos').value; 
    var finalDate    = document.getElementById('p-date').value; 
    var finalTime    = document.getElementById('p-time').value; 
    var finalDepth   = document.getElementById('p-depth').value || "미입력"; 
    var finalTide    = document.getElementById('p-tide').value; 
    var finalTemp    = document.getElementById('p-temp-real').value; 
    var finalFish    = document.getElementById('p-fish').value || "미입력"; // 입력받은 최종 어종 텍스트
    var finalTackle  = document.getElementById('p-tackle').value; 
    var finalMemo    = document.getElementById('p-memo').value; 
    
    var isDepthCheckSelect = document.getElementById('p-depth-check').checked;

    if (currentInfoWindow) currentInfoWindow.close();
    if (currentMarker) currentMarker.setMap(null);

    // 🌟 [대표님 지시 핵심 로직: 어종 식별 및 마커 이미지 분기 처리]
    var markerImageUrl = FISH_MARKER_MAP["기본"]; // 매칭 없으면 기본 미니점으로 세팅
    var currentWidth = 10;
    var currentHeight = 10;
    var currentOffsetX = 5;
    var currentOffsetY = 5;

    // 만약 사용자가 지정한 4대 어종 이름이 포함되어 있다면 해당 마커 이미지로 전격 변신!
    if (FISH_MARKER_MAP[finalFish]) {
        markerImageUrl = FISH_MARKER_MAP[finalFish];
        currentWidth = MARKER_WIDTH;
        currentHeight = MARKER_HEIGHT;
        currentOffsetX = OFFSET_X;
        currentOffsetY = OFFSET_Y;
    }

    var appMarkerImage = new kakao.maps.MarkerImage(
        markerImageUrl, 
        new kakao.maps.Size(currentWidth, currentHeight), 
        { offset: new kakao.maps.Point(currentOffsetX, currentOffsetY) }
    );

    var fixLatLng = new kakao.maps.LatLng(lastClickLat, lastClickLng);
    var permanentMarker = new kakao.maps.Marker({
        position: fixLatLng,
        image: appMarkerImage, // 어종별 디자인 옷 최종 착용!
        clickable: true 
    });
    permanentMarker.setMap(map);

    // 지능형 수심 숫자 누적 맵핑 로직
    if (isDepthCheckSelect) {
        var loader = document.getElementById('loading-screen');
        loader.classList.add('show'); 

        getOceanDepthData(lastClickLat, lastClickLng, function(depthResponse) {
            loader.classList.remove('show'); 

            if (depthResponse.success && depthResponse.rawItems && depthResponse.rawItems.length > 0) {
                let addedCount = 0; 

                depthResponse.rawItems.forEach(function(pt) {
                    var targetKey = `${parseFloat(pt.lat).toFixed(5)},${parseFloat(pt.lng).toFixed(5)}`;
                    var isAlreadyExists = depthTextOverlays.some(function(existingOverlay) {
                        var pos = existingOverlay.getPosition();
                        return `${pos.getLat().toFixed(5)},${pos.getLng().toFixed(5)}` === targetKey;
                    });

                    if (isAlreadyExists) return; 

                    var numLatLng = new kakao.maps.LatLng(pt.lat, pt.lng);
                    var cleanNum = pt.dpwt.replace(" m", "");
                    var customOverlayContent = `<div class="sea-depth-number">${cleanNum}</div>`;
                    
                    var depthTextOverlay = new kakao.maps.CustomOverlay({
                        position: numLatLng,
                        content: customOverlayContent,
                        yyanchor: 0.5,
                        xxanchor: 0.5
                    });

                    depthTextOverlay.setMap(map);
                    depthTextOverlays.push(depthTextOverlay); 
                    addedCount++;
                });
                
                if (addedCount > 0) {
                    alert(`주변에 새로운 수심 데이터 ${addedCount}개가 누적 맵핑되었습니다!`);
                }
            }
        });
    }

    var newPoint = {
        id: Date.now(),
        address: finalAddress,
        coords: tempCoords,
        date: finalDate,
        time: finalTime,
        depth: finalDepth + (isNaN(finalDepth) ? "" : " m"), 
        tide: finalTide || "미입력",
        temp: finalTemp || "미입력",
        fish: finalFish,
        tackle: finalTackle || "미입력",
        memo: finalMemo || "미입력",
        markerRef: permanentMarker 
    };

    // 메인 마커 재클릭 이벤트 
    kakao.maps.event.addListener(permanentMarker, 'click', function() {
        if (currentInfoWindow) currentInfoWindow.close();

        var detailContent = `
            <div class="info-form" style="padding:12px; width:280px;">
                <h4 style="margin:0 0 8px 0; color:#dc2626; border-bottom:2px solid #dc2626;">📌 등록된 포인트 상세</h4>
                <div class="info-row"><span>장소</span><span style="font-size:11px; color:#333;">${newPoint.address}</span></div>
                <div class="info-row"><span>좌표</span><span style="font-size:11px; color:#007BFF;">${newPoint.coords}</span></div>
                <div class="info-row"><span>어종</span><span style="font-size:12px; color:#e11d48; font-weight:bold;">🐟 ${newPoint.fish}</span></div>
                <div class="info-row"><span>수심</span><span style="font-size:12px; color:#007BFF; font-weight:bold;">${newPoint.depth}</span></div>
                <div class="info-row"><span>날짜</span><span style="font-size:11px; color:#333;">${newPoint.date} ${newPoint.time}</span></div>
                <div class="info-row"><span>물때/수온</span><span style="font-size:11px; color:#1e3a8a;">${newPoint.tide} / ${newPoint.temp}℃</span></div>
                <div class="info-row"><span>태클</span><span style="font-size:11px; color:#555;">${newPoint.tackle}</span></div>
                <div class="info-row" style="border-top:1px dashed #ddd; margin-top:6px; padding-top:4px;">
                    <span>기타</span><span style="font-size:11px; color:#666; width:200px; word-break:break-all;">${newPoint.memo}</span>
                </div>
                <div style="text-align:right; margin-top:8px;">
                    <button class="form-btn btn-cancel" style="padding:2px 8px; font-size:10px;" onclick="currentInfoWindow.close()">닫기</button>
                </div>
            </div>
        `;

        map.panTo(permanentMarker.getPosition());
        currentInfoWindow = new kakao.maps.InfoWindow({ content: detailContent, removable: false });
        currentInfoWindow.open(map, permanentMarker);
    });

    fishingPointsDataset.push(newPoint);
    currentMarker = null;
    currentInfoWindow = null;
    
    if(!isDepthCheckSelect) {
        alert(`${finalFish} 포인트가 성공적으로 등록되었습니다!`);
    }
}

function cancelFishingPoint() {
    if (currentInfoWindow) currentInfoWindow.close();
    if (currentMarker) currentMarker.setMap(null);
    currentMarker = null;
    currentInfoWindow = null;
    alert("등록이 취소되었습니다.");
}

function openListSidebar() {
    var sidebar = document.getElementById('list-sidebar');
    var listBox = document.getElementById('list-box-content');
    
    sidebar.classList.add('open');
    document.getElementById('list-btn').classList.add('active');

    if (fishingPointsDataset.length === 0) {
        listBox.innerHTML = `<p style="text-align:center; color:#888; margin-top:30px;">등록된 포인트가 없습니다.<br>지도에서 포인트를 등록해보세요!</p>`;
        return;
    }

    var htmlContent = "";
    for (var i = fishingPointsDataset.length - 1; i >= 0; i--) {
        var pt = fishingPointsDataset[i];
        htmlContent += `
            <div class="list-item" style="border-left-color: #dc2626;">
                <div class="list-item-title">🐟 ${pt.fish} 포인트 (${pt.address})</div>
                <div class="list-item-coords">🌐 좌표: ${pt.coords}</div>
                <div class="list-item-grid">
                    <div><b>📅 날짜:</b> ${pt.date}</div>
                    <div style="color:#007BFF;"><b>🌊 수심:</b> ${pt.depth}</div>
                    <div><b>🌊 물때:</b> ${pt.tide}</div>
                    <div><b>🌡️ 수온:</b> ${pt.temp}</div>
                </div>
                <div style="font-size:11px; color:#666; margin-top:6px; border-top:1px dashed #eee; padding-top:4px;">
                    <b>📝 메모:</b> ${pt.memo}
                </div>
            </div>
        `;
    }
    listBox.innerHTML = htmlContent;
}

function closeListSidebar() {
    document.getElementById('list-sidebar').classList.remove('open');
    document.getElementById('list-btn').classList.remove('active');
}

function clickMenu(menuName) { 
    alert(menuName + " 메뉴를 클릭하셨습니다!"); 
}

function updateMyLocationMarker(lat, lng) {
    var locPosition = new kakao.maps.LatLng(lat, lng);
    
    // 마커가 이미 있다면 위치만 수정
    if (myLocationMarker) {
        myLocationMarker.setPosition(locPosition);
    } else {
        // 마커가 없다면 새로 생성 (파란색 원형 마커 아이콘)
        var imageSize = new kakao.maps.Size(24, 24);
        var markerImage = new kakao.maps.MarkerImage(
            'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png', // 원하는 마커 이미지 URL
            imageSize
        );
        
        myLocationMarker = new kakao.maps.Marker({
            map: map,
            position: locPosition,
            image: markerImage,
            title: "내 위치"
        });
    }
}
