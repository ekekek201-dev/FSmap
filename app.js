import { db } from './firebase.js';

import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";


async function loadStations(path) {
    try {
        await new Promise(resolve => setTimeout(resolve, 100));
        const response = await fetch(path); // 상대 경로로 직접 호출
        const stations = await response.json(); // JSON으로 변환        
        return stations;
    } catch (error) {
        console.error("데이터 로드 실패:", error);
    }
}





const loader =
        document.getElementById('loading-screen');

loader.classList.add('show');
let stations = await loadStations('./data/area.json');
//let stations_temp = await loadStations('./data/temp-area-a.json');
let stations_temp = await loadStations('./data/temp-allarea.json');
loader.classList.remove('show');

console.log("버전 34");





// [상단 전역 변수 섹션]
let isRegisterMode = false;
let currentMarker = null;
let currentInfoWindow = null;
const fishingPointsDataset = []; 
let tempCoords = ""; 
let myLocationMarker = null;
let depthTextOverlays = []; 
let lastClickLat = 0;
let lastClickLng = 0;
let hasLocated = false; // 여기 추가!

const FISH_MARKER_MAP = {
    "쏨뱅이": "#FF0000",     // 🔴
    "붉바리": "#FF6600",     // 🟠
    "볼락": "#8B4513",       // 🟤
    "농어": "#0066FF",       // 🔵
    "무늬": "#FFD700",       // 🟡
    "플랫피쉬": "#00AA00",   // 🟢
    "회유성": "#9932CC",     // 🟣
    "내위치": "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png", 
    "기본": "#808080"        // 회색
};

// 마커 사이즈 및 규격 정의
const MARKER_WIDTH = 24;
const MARKER_HEIGHT = 35;
const OFFSET_X = 12;
const OFFSET_Y = 35;


// =================================================================
// 🗺️ 카카오 지도 생성 및 하이브리드 위성 세팅

// 1. 기본 좌표 설정
const defaultLat = 36.495;
const defaultLng = 129.445;

const container = document.getElementById('map');
const options = {
    center: new kakao.maps.LatLng(defaultLat, defaultLng),
    level: 3,
    mapTypeId : kakao.maps.MapTypeId.HYBRID 
};

const map = new kakao.maps.Map(container, options);
const geocoder = new kakao.maps.services.Geocoder();

// 지도의 줌 레벨이 변경될 때마다 실행
kakao.maps.event.addListener(map, 'zoom_changed', function() {
    const level = map.getLevel(); 
    const SHOW_LEVEL = 8; // 레벨 이하(확대)일 때만 수심 숫자가 보임

    depthTextOverlays.forEach(function(overlay) {
        // 현재 레벨이 8보다 크면(축소) null을 주어 숨기고, 작으면 map을 주어 표시
        //overlay.setMap(level <= SHOW_LEVEL ? map : null);
        depthTextOverlays = []; //지도에서 삭
    });

    fishingPointsDataset.forEach(function(point) {
        point.labelRef?.setMap(level <= 6 ? map : null);
    });

});

initMyPosition();



loadFishingPointsFromFirebase();

document
    .getElementById("reg-btn")
    .addEventListener("click", toggleRegisterMode);

document
    .getElementById("my-loc-btn")
    .addEventListener("click", moveToCurrentLocation);

document
    .getElementById("list-btn")
    .addEventListener("click", openListSidebar);

document
    .getElementById("list-close-btn")
    .addEventListener("click", closeListSidebar);

document
    .getElementById("depth-btn")
    .addEventListener("click", updateDepthMap);



async function loadLunarData() {
    const response = await fetch('./data/lunar-data.json');

    if (!response.ok) {
        throw new Error('음력 데이터 로드 실패');
    }

    return await response.json();
}

const lunarData = await loadLunarData();


function getMultte(dateStr, lunarData) {

    const lunar = lunarData[dateStr];

    if (!lunar) {
        return null;
    }

    return ((lunar.day + 6) % 15) + 1;
}

const multte = getMultte('2026-06-05', lunarData);

console.log(multte + '물');


const FISH_MARKER_MAP2 = {
    //"쏨뱅이": "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png",
    "쏨뱅이": "img/redfish.png",
    "붉바리": "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
    "볼락": "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
    "농어": "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
    "기본": "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/mini_circle.png",
    "내위치": "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png" // 추가
};



// =================================================================
// 📍 포인트 등록 모드 토글 함수
// =================================================================
function toggleRegisterMode() {
    const regBtn = document.getElementById('reg-btn');
    const pointer = document.getElementById('pointer');
    
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
kakao.maps.event.addListener(map, 'click', function() {
    if (isRegisterMode === false) return; 

    if (currentInfoWindow) currentInfoWindow.close();

    const centerLatLng = map.getCenter();
    lastClickLat = centerLatLng.getLat();
    lastClickLng = centerLatLng.getLng();
    
    // 조준 중일 때 지도 중심에 임시로 띄워둘 기본 마커 설정
    const markerImage = new kakao.maps.MarkerImage(
        FISH_MARKER_MAP["기본"], 
        new kakao.maps.Size(12, 12), 
        { offset: new kakao.maps.Point(6, 6) }
    );

    currentMarker = new kakao.maps.Marker({ 
        position: centerLatLng,
        image: markerImage 
    });
    currentMarker.setMap(map);

    tempCoords = `${lastClickLat.toFixed(5)}, ${lastClickLng.toFixed(5)}`;

    const now = new Date();
    const currentDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; 
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;        

    geocoder.coord2RegionCode(lastClickLng, lastClickLat, function(result, status) {
        const addressName = (status === kakao.maps.services.Status.OK && result[0]) ? result[0].address_name : "알 수 없는 지역";

     
        const formContent = `
            <div class="info-form">
                <h4>🎣 포인트 정보 입력</h4>
                <div class="info-row"><span>장소</span><input type="text" id="p-pos" value="${addressName}" readonly></div>
                <div class="info-row" style="display:none;"><span>좌표</span><input type="hidden" value="${tempCoords}" readonly style="color:#888;"></div>
                <div class="info-row"><span>날짜</span><input type="date" id="p-date" value="${currentDateStr}"></div>
                <div class="info-row"><span>시간</span><input type="time" id="p-time" value="${currentTimeStr}"></div>
                <div class="info-row"><span>수심</span><input type="text" id="p-depth" placeholder="수심 정보 입력" style="font-weight:bold; color:#007BFF;"></div>                         
                <div class="info-row" style="display:none;"><span>물때</span><input type="text" id="p-tide" placeholder="자동 물때" readonly></div>
                <div class="info-row" style="display:none;"><span>수온</span><input type="text" id="p-temp-real" placeholder="수온 정보" readonly></div>
                <div class="info-row" style="display:none;">
                <span>조위(Tide)</span>
                <input type="text" id="p-l-tide" placeholder="간조(자동)" style="width: 105px; margin-left:15px; border: 1px solid #3b82f6;" readonly>
                <input type="text" id="p-h-tide" placeholder="만조(자동)" style="width: 105px; border: 1px solid #ef4444;" readonly>
                </div>
                
                <div class="info-row">
                    <span>어종</span>
                    <div class="fish-combo-box">
                        <input type="text" id="p-fish" placeholder="어종을 입력하거나 선택하세요.">
                        <select id="p-fish-select">
                            <option value="">직접입력</option>
                            <option value="쏨뱅이">쏨뱅이</option>
                            <option value="붉바리">붉바리</option>
                            <option value="볼락">볼락</option>
                            <option value="농어">농어</option>
                            <option value="무늬">무늬</option>
                            <option value="플랫피쉬">플랫피쉬</option>
                            <option value="회유성">회유성</option>
                        </select>
                    </div>
                </div>

                <div class="info-row"><span>태클</span><input type="text" id="p-tackle" placeholder="채비 입력"></div>
                <div class="info-row"><span>기타</span><input type="text" id="p-memo" placeholder="기타 메모"></div>
                <div class="btn-group">
                    <button id = "pop-save-btn" class="form-btn btn-submit">등록</button>
                    <button id="pop-cancel-btn" class="form-btn btn-cancel">취소</button>
                </div>
            </div>
        `;

        currentInfoWindow = new kakao.maps.InfoWindow({ content: formContent, removable: false });
        currentInfoWindow.open(map, currentMarker);
        setTimeout(() => {
            document
                .getElementById("p-fish-select")
                ?.addEventListener("change", syncFishDropdown);
            document
                .getElementById("pop-save-btn")
                ?.addEventListener("click",saveFishingPoint);
            document
                .getElementById("pop-cancel-btn")
                ?.addEventListener("click",cancelFishingPoint);
        },0);
    });

    toggleRegisterMode();
});

// 🔄 드롭다운에서 어종을 고르면 텍스트 칸에 글자가 자동으로 꽂히는 연동 함수
function syncFishDropdown() {
    const selectElement = document.getElementById('p-fish-select');
    const inputElement = document.getElementById('p-fish');
    if (selectElement.value !== "") {
        inputElement.value = selectElement.value;
    }
}

// =================================================================
function getFormData() {
    return {
        address: document.getElementById('p-pos').value,
        date: document.getElementById('p-date').value,
        time: document.getElementById('p-time').value,
        depth: document.getElementById('p-depth').value,
        tide: document.getElementById('p-tide').value,
        temp: document.getElementById('p-temp-real').value,
        h_tide: document.getElementById('p-h-tide').value,
        l_tide: document.getElementById('p-l-tide').value,
        fish: document.getElementById('p-fish').value || "미입력",
        tackle: document.getElementById('p-tackle').value,
        memo: document.getElementById('p-memo').value,
        
    };
}

function createFishingMarker(fishName, position, date) {
    const color =
    FISH_MARKER_MAP[fishName] ||
    FISH_MARKER_MAP["기본"];

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24">
        <circle
            cx="12"
            cy="12"
            r="10"
            fill="${color}"
            stroke="white"
            stroke-width="2"/>
    </svg>`;



    const markerImage = new kakao.maps.MarkerImage(
        'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
        new kakao.maps.Size(20, 20),
        {
            offset: new kakao.maps.Point(12, 12)
        }
    );


    const marker = new kakao.maps.Marker({
        position: position,
        image: markerImage,
        clickable: true
    });
    marker.setMap(map); 
    
    const label = new kakao.maps.CustomOverlay({
        position: position,
        content: `<div class="fish-label">${date}</div>`, // 🐟 이모지 없이 깔끔하게 표시
        yAnchor: 1.5 // 마커 이미지 위로 조금 더 올림
    });
    label.setMap(map);
    return { marker, label };
}

function createFishingMarker_png(fishName, position) {
    let markerImageUrl = FISH_MARKER_MAP["기본"];
    let width = 10;
    let height = 10;
    let offsetX = 5;
    let offsetY = 5;

    if (FISH_MARKER_MAP[fishName]) {
        markerImageUrl = FISH_MARKER_MAP[fishName];
        width = MARKER_WIDTH;
        height = MARKER_HEIGHT;
        offsetX = OFFSET_X;
        offsetY = OFFSET_Y;
    }

    const markerImage = new kakao.maps.MarkerImage(
        markerImageUrl,
        new kakao.maps.Size(width, height),
        {
            offset: new kakao.maps.Point(offsetX, offsetY)
        }
    );

    const marker = new kakao.maps.Marker({
        position,
        image: markerImage,
        clickable: true
    });

    marker.setMap(map);

    const label = new kakao.maps.CustomOverlay({
        position: position,
        content: `<div class="fish-label">${fishName}</div>`, // 🐟 이모지 없이 깔끔하게 표시
        yAnchor: 1.5 // 마커 이미지 위로 조금 더 올림
    });
    label.setMap(map);
    return { marker, label };
}

function createFishingPointData(formData, marker,tideData,tideData_temp) {
    //const tideData = await getAllTideData(37.123, 126.456, '20260605');
    return {
        id: Date.now(),
        lat: lastClickLat,
        lng: lastClickLng,
        address: formData.address,
        coords: tempCoords,
        date: formData.date,
        time: formData.time,
        depth: formData.depth || "미입력",  
        tide: getMultte(formData.date, lunarData) + "물",
        l_tide: tideData?.prevTide|| "조회실패",
        h_tide: tideData?.nextTide|| "조회실패",
        tide_dis: tideData?.distance|| "조회실패",
        temp_dis: tideData_temp?.distance|| "조회실패", 
        temp: tideData_temp.temp || "조회실패",
        fish: formData.fish,
        tackle: formData.tackle || "미입력",
        memo: formData.memo || "미입력",
        markerRef: marker
    };
}



function clearDepthOverlays() {

    depthTextOverlays.forEach(function(overlay) {
        overlay.setMap(null);
    });

    depthTextOverlays.length = 0;
}

function updateDepthMap() {

    clearDepthOverlays();

    const center =
        map.getCenter();

    showDepthData(
        center.getLat(),
        center.getLng()
    );
}

function showDepthData(lat, lng) {

    const loader =
        document.getElementById('loading-screen');

    loader.classList.add('show');

    getOceanDepthData(
        lat,
        lng,
        function(depthResponse) {

            loader.classList.remove('show');

            if (
                !depthResponse.success ||
                !depthResponse.rawItems ||
                depthResponse.rawItems.length === 0
            ) {
                return;
            }

            let addedCount = 0;

            depthResponse.rawItems.forEach(function(pt) {

                const numLatLng =
                    new kakao.maps.LatLng(
                        pt.lat,
                        pt.lng
                    );

                const cleanNum =
                    pt.dpwt.replace(" m", "");

                const customOverlayContent =
                    `<div class="sea-depth-number">${cleanNum}</div>`;

                const depthTextOverlay =
                    new kakao.maps.CustomOverlay({
                        position: numLatLng,
                        content: customOverlayContent,
                        yAnchor: 0.5,
                        xAnchor: 0.5
                    });

                depthTextOverlay.setMap(map);

                depthTextOverlays.push(
                    depthTextOverlay
                );

                addedCount++;
            });

            alert(
                `수심 데이터 ${addedCount}개 표시 완료`
            );
        }
    );
}

function attachMarkerClickEvent(marker, point) {

    kakao.maps.event.addListener(marker, 'click', function() {

        if (currentInfoWindow) {
            currentInfoWindow.close();
        }

        const lValue = Number(point.l_tide.match(/\(([-\d.]+)\)/)?.[1] || 0);
        const hValue = Number(point.h_tide.match(/\(([-\d.]+)\)/)?.[1] || 0);

        const lColor = lValue < hValue ? 'blue' : 'red';
        const hColor = hValue > lValue ? 'red' : 'blue';

        const tideHtml = `
            <span style="color:${lColor};font-weight:bold">
                ${point.l_tide}
            </span>
            /
            <span style="color:${hColor};font-weight:bold">
                ${point.h_tide}
            </span>
            `;
        
        const detailContent = `
            <div class="info-form" style="padding:12px; width:280px;">
                <h4 style="margin:0 0 8px 0; color:#dc2626; border-bottom:2px solid #dc2626;">
                    📌 포인트 저장 정보
                </h4>

                <div class="info-row">
                    <span>장소</span>
                    <span style="font-size:11px;">${point.address}</span>
                </div>

                <!--
                <div class="info-row">
                    <span>좌표</span>
                    <span style="font-size:11px;">${point.coords}</span>
                </div>
                -->

                <div class="info-row">
                    <span>날짜</span>
                <span>${point.date} ${point.time}</span>
                </div>
                
                <div class="info-row">
                    <span>어종</span>
                    <span>🐟 ${point.fish}</span>
                </div>

                <div class="info-row">
                    <span>수심</span>
                    <span>${point.depth}</span>
                </div>

                <div class="info-row">
                    <span>물때</span>
                    <span>${point.tide}</span>
                </div>

                <div class="info-row">
                    <span>조석</span>
                    <span>${tideHtml}${point.tide_dis !== undefined ? ` - ${point.tide_dis}떨어짐` : ''}</span>
                </div>
                
                <div class="info-row">
                    <span>수온</span>
                    <span>${point.temp}℃${point.temp_dis !== undefined ? ` - ${point.temp_dis}떨어짐` : ''}</span>
                </div>

                <div class="info-row">
                    <span>태클</span>
                    <span>${point.tackle}</span>
                </div>

                <div class="info-row">
                    <span>기타</span>
                    <span>${point.memo}</span>
                </div>

                <div style="text-align:right; margin-top:8px;">
                    <button
                        class="form-btn btn-cancel delete-btn"
                        data-id="${point.id}">
                        삭제
                    </button>

                    <button class="form-btn btn-cancel edit-btn" data-id="${point.id}">
                        수정
                    </button>
                    
                    <button
                        class="form-btn btn-cancel close-btn">
                        닫기
                    </button>
                </div>
            </div>
        `;

        map.panTo(marker.getPosition());

        currentInfoWindow =
            new kakao.maps.InfoWindow({
                content: detailContent,
                removable: false
            });

        currentInfoWindow.open(map, marker);

        setTimeout(() => {

            document
                .querySelector(".delete-btn")
                ?.addEventListener("click", () => {
                    deleteFishingPoint(point.id);
                });

            document.querySelector(".edit-btn")
                ?.addEventListener("click", () => {
                     openEditMode(point);
                });
            
            document
                .querySelector(".close-btn")
                ?.addEventListener("click", () => {
                    currentInfoWindow.close();
                });

        }, 0);
    });
}

async function savePointToFirebase(point) {

    try {

        const saveData = {
            id: point.id,
            lat: point.lat,
            lng: point.lng,

            address: point.address,
            coords: point.coords,

            date: point.date,
            time: point.time,

            depth: point.depth,            

            tide: point.tide,
            l_tide: point.l_tide,
            h_tide: point.h_tide,
            tide_dis: point.tide_dis,
            temp_dis: point.temp_dis,
            temp: point.temp,

            fish: point.fish,

            tackle: point.tackle,
            memo: point.memo
        };

        const docRef = await addDoc(
            collection(db, "fishingPoints"),
            saveData
        );

        point.firebaseId = docRef.id;

        console.log("Firebase 저장 완료:", docRef.id);

    } catch(error) {

        console.error("Firebase 저장 실패:", error);

    }
}
async function loadFishingPointsFromFirebase() {

    try {

        const querySnapshot =
            await getDocs(
                collection(db, "fishingPoints")
            );
        

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            data.firebaseId = doc.id; // 문서 ID를 데이터에 포함
            
            const position = new kakao.maps.LatLng(data.lat, data.lng);
            const markerObj = createFishingMarker(data.fish, position, data.date);
            
            data.markerRef = markerObj.marker;
            data.labelRef = markerObj.label;
            
            
            attachMarkerClickEvent(markerObj.marker,data);
            fishingPointsDataset.push(data);
        });

    } catch (error) {

        console.error(
            "Firestore 로드 실패",
            error
        );

    }
}
////////////포인트 저장 함수//////////////////////////////////////////
async function saveFishingPoint() {
    loader.classList.add('show');

    const formData = getFormData(); // 폼 데이터 수집
    
    const tideData = await getAllTideData(
        lastClickLat,
        lastClickLng,
        formData.date,
        formData.time
    );
    
    const tideData_temp = await getAllTideData_temp(
        lastClickLat,
        lastClickLng,
        formData.date,
        formData.time
    );

    if (currentInfoWindow) currentInfoWindow.close();
    if (currentMarker) currentMarker.setMap(null); 

    const fixLatLng = new kakao.maps.LatLng(lastClickLat, lastClickLng); // 클릭한 지점의 좌표를 고정하여 마커 생성에 사용
    const markerObj = createFishingMarker(formData.fish, fixLatLng, formData.date);
    const newPoint = createFishingPointData(
        formData,
        markerObj.marker,
        tideData,
        tideData_temp
    );
    newPoint.labelRef = markerObj.label;
    
    savePointToFirebase(newPoint);
    
    attachMarkerClickEvent(markerObj.marker, newPoint); 
    fishingPointsDataset.push(newPoint);    
    

    currentMarker = null;
    currentInfoWindow = null;
    loader.classList.remove('show');

    if(!formData.useDepthApi) {
        //alert(`${formData.fish} 포인트가 성공적으로 등록되었습니다!`);
    }
}

/////////////////////////////////////////////////////   

function cancelFishingPoint() {
    if (currentInfoWindow) currentInfoWindow.close();
    if (currentMarker) currentMarker.setMap(null);
    currentMarker = null;
    currentInfoWindow = null;
    //alert("등록이 취소되었습니다.");
}

function openListSidebar() {
    const sidebar = document.getElementById('list-sidebar');
    const listBox = document.getElementById('list-box-content');
    
    sidebar.classList.add('open');
    document.getElementById('list-btn').classList.add('active');

    if (fishingPointsDataset.length === 0) {
        listBox.innerHTML = `<p style="text-align:center; color:#888; margin-top:30px;">등록된 포인트가 없습니다.<br>지도에서 포인트를 등록해보세요!</p>`;
        return;
    }

    let htmlContent = "";
    for (let i = fishingPointsDataset.length - 1; i >= 0; i--) {
        const pt = fishingPointsDataset[i];
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
    const locPosition = new kakao.maps.LatLng(lat, lng);
    
    if (myLocationMarker) {
        myLocationMarker.setPosition(locPosition);
        myLocationMarker.setMap(map);
    } else {
        
        const markerImage = new kakao.maps.MarkerImage(
            FISH_MARKER_MAP["내위치"],
            new kakao.maps.Size(20, 20), 
            { offset: new kakao.maps.Point(10, 20) } 
        );

        myLocationMarker = new kakao.maps.Marker({
            map: map,
            position: locPosition,
            image: markerImage, // 이미지 적용
            title: "내 위치"
        });
    }
}

// 현재 위치로 지도 중심 이동 및 내 위치 마커 업데이트
function moveToCurrentLocation() {
    if (navigator.geolocation) {
        // 로딩 레이어 표시
        const loader = document.getElementById('loading-screen');
        loader.classList.add('show');

        navigator.geolocation.getCurrentPosition(
            function(position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const locPosition = new kakao.maps.LatLng(lat, lng);
                
                // 지도 중심 이동
                map.setCenter(locPosition);
                map.setLevel(3); // 적절한 줌 레벨로 설정
                
                // 내 위치 마커 표시/업데이트 (기존 함수 활용)
                updateMyLocationMarker(lat, lng);
                
                loader.classList.remove('show');
            },
            function(error) {
                loader.classList.remove('show');
                alert("현재 위치를 가져올 수 없습니다. 위치 권한을 확인해주세요.");
            },
            { enableHighAccuracy: true, timeout: 1000, maximumAge: 0 }
        );
    } else {
        alert("이 브라우저는 위치 서비스를 지원하지 않습니다.");
    }
    
}

// [새로운 방식] 지도 생성 직후 바로 실행되는 초기화 함수
function initMyPosition() {
    if (hasLocated) return; // 이미 위치를 잡았다면 중복 실행 방지

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const locPosition = new kakao.maps.LatLng(lat, lng);
                
                map.setCenter(locPosition);
                updateMyLocationMarker(lat, lng);
                hasLocated = true; // 플래그 설정
            },
            function(error) {
                console.log("초기 위치 조회 실패, 기본 좌표 사용");
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    }
}

async function deleteFishingPoint(id) {

    if (!confirm("이 포인트를 삭제하시겠습니까?")) return;

    const index = fishingPointsDataset.findIndex(pt => pt.id === id);
    if (index === -1) return;

    const pt = fishingPointsDataset[index];

    try {
        // 1. Firebase 삭제 (핵심)
        if (pt.firebaseId) {
            await deleteDoc(doc(db, "fishingPoints", pt.firebaseId));
        }

        // 2. 지도 마커 제거
        if (pt.markerRef) {
            pt.markerRef.setMap(null);
        }
        if (pt.labelRef) pt.labelRef.setMap(null);
        
        // 3. 로컬 데이터 삭제
        fishingPointsDataset.splice(index, 1);

        // 4. UI 정리
        if (currentInfoWindow) currentInfoWindow.close();

        //alert("포인트가 삭제되었습니다.");

        // 리스트 새로고침
        if (document.getElementById('list-sidebar').classList.contains('open')) {
            openListSidebar();
        }

        

    } catch (error) {
        console.error("삭제 실패:", error);
        alert("삭제 중 오류가 발생했습니다.");
    }
}

async function updateFishingPoint(id, updatedData) {

    try {
        const index = fishingPointsDataset.findIndex(pt => pt.id === id);
        if (index === -1) return;

        const pt = fishingPointsDataset[index];

        // 1. Firestore 업데이트
        if (pt.firebaseId) {
            await updateDoc(
                doc(db, "fishingPoints", pt.firebaseId),
                updatedData
            );
        }

        // 2. 로컬 데이터 업데이트
        fishingPointsDataset[index] = {
            ...pt,
            ...updatedData
        };
        refreshMarker(fishingPointsDataset[index]);
        alert("수정 완료!");
        
    } catch (err) {
        console.error("수정 실패:", err);
        alert("수정 중 오류 발생");
    }
}

function openEditMode(point) {

    if (currentInfoWindow) currentInfoWindow.close();

    const editContent = `
        <div class="info-form">
            <h4>✏️ 포인트 수정</h4>

            <div class="info-row">
                <span>어종</span>

                <input
                    type="text"
                    id="e-fish"
                    value="${point.fish}"
                    list="fish-list">

                <datalist id="fish-list">
                    <option value="쏨뱅이">
                    <option value="붉바리">
                    <option value="볼락">
                    <option value="농어">
                    <option value="무늬">
                    <option value="플랫피쉬">
                    <option value="회유성">
                </datalist>
            </div>

            <div class="info-row">
                <span>수심</span>
                <input type="text" id="e-depth" value="${point.depth}">
            </div>

            <div class="info-row" style="display:none;">
                <span>물때</span>
                <input type="text" id="e-tide" value="${point.tide}">
            </div>

            <div class="info-row" style="display:none;">
                <span>수온</span>
                <input type="text" id="e-temp" value="${point.temp}">
            </div>

            <div class="info-row">
                <span>태클</span>
                <input type="text" id="e-tackle" value="${point.tackle}">
            </div>

            <div class="info-row">
                <span>기타</span>
                <input type="text" id="e-memo" value="${point.memo}">
            </div>

            <div class="btn-group">
                <button class="form-btn btn-submit" id="save-edit">저장</button>
                <button class="form-btn btn-cancel" id="cancel-edit">취소</button>
            </div>
        </div>
    `;

    const marker = point.markerRef;

    currentInfoWindow = new kakao.maps.InfoWindow({
        content: editContent,
        removable: false
    });

    currentInfoWindow.open(map, marker);

    setTimeout(() => {

        document.getElementById("save-edit")
            ?.addEventListener("click", () => {

                const updatedData = {
                    fish: document.getElementById("e-fish").value,
                    depth: document.getElementById("e-depth").value,
                    tide: document.getElementById("e-tide").value,
                    temp: document.getElementById("e-temp").value,
                    tackle: document.getElementById("e-tackle").value,
                    memo: document.getElementById("e-memo").value
                };

                updateFishingPoint(point.id, updatedData);
                Object.assign(point, updatedData);
                currentInfoWindow.close();
                attachMarkerClickEvent(point.markerRef, point);
            });

        document.getElementById("cancel-edit")
            ?.addEventListener("click", () => {
                currentInfoWindow.close();
            });

    }, 0);
}

function refreshMarker(point) {

    // 기존 마커 제거
    if (point.markerRef) point.markerRef.setMap(null);
    if (point.labelRef) point.labelRef.setMap(null);
    // 새 위치
    const position = new kakao.maps.LatLng(point.lat, point.lng);

    // 새 마커 생성 (fish 기준)
    const markerObj = createFishingMarker(point.fish, position, point.date);

    point.markerRef = markerObj.marker;
    point.labelRef = markerObj.label;
    
    // 클릭 이벤트 다시 연결
    attachMarkerClickEvent(markerObj.marker, point);
}


function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 지구 반지름(km)

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );

    return R * c; // km
}

function findNearest(lat, lng, stations) {

    if (stations.length === 0) {
        console.error("아직 관측소 데이터가 로드되지 않았습니다!");
        return null;
    }

    let minDistance = Infinity;
    let nearest = null;

    stations.forEach(s => {
        const distance = getDistance(
            lat,
            lng,
            parseFloat(s.lat),
            parseFloat(s.lot)
        );

        if (distance < minDistance) {
            minDistance = distance;
            nearest = s;            
        }
    });

    return {
    ...nearest,
    distance: `${Math.round(minDistance)}km`
};
}

function findNearestSorted(lat, lng, stations) {

    if (!stations.length) {
        console.error("아직 관측소 데이터가 로드되지 않았습니다!");
        return [];
    }

    return stations
        .map(s => {
            const distance = getDistance(
                lat,
                lng,
                parseFloat(s.lat),
                parseFloat(s.lot)
            );

            return {
                ...s,
                distance
            };
        })
        .sort((a, b) => a.distance - b.distance);
}

async function getAllTideData(lat,lng, date,time) {
    
    const station = findNearest(lat, lng, stations);
    console.log("가장 가까운 관측소:", station.name, `(${station.lat}, ${station.lot}, ${station.distance})`);
    const tideData = await getTideData(station.code, date,time);
    tideData.distance = station.distance;
    console.log(tideData);
    return tideData;
};

async function getAllTideData_temp_bak(lat,lng, date,time) {
    const station_temp = findNearestSorted(lat, lng, stations_temp);    
    //const station_temp = findNearest(lat, lng, stations_temp);
    console.log("가까운 관측소(수온):", station_temp[0].name, `(${station_temp[0].lat}, ${station_temp[0].lot}, ${station_temp[0].type}, ${station_temp[0].distance})`);
    
    for (let i = 0; i < 3; i++) {
        try{
            console.log("관측소(수온):",station_temp[i].name,station_temp[i].code)
            
            let tideData_temp = null;
            
            if(station_temp[i].type == "api_a") {
                tideData_temp = await getWaterTemp_a(station_temp[i].code, date,time);
                          
            } else if(station_temp[i].type == "api_b") {
                tideData_temp = await getWaterTemp_b(station_temp[i].code, date,time);        
                
            } else if(station_temp[i].type == "api_c") {
                tideData_temp = await getWaterTemp_c(station_temp[i].code, date,time);    
                
            }
                
            if (tideData_temp != null) {
                    console.log("리턴");
                    return {
                        temp: tideData_temp,
                        //distance: station_temp[i].distance
                        distance: `${Math.round(station_temp[i].distance)}km`
                    };
            }                    
        }catch(err){
            console.log(`실패 (${station_temp[i].name})`, err.message);
            continue;
        }
}};


async function loadTempData(dateStr) {

    const [yyyy, mm] = dateStr.split('-');

    const url =
        `./data/temp/${yyyy}/${mm}/${dateStr}.json`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`파일 없음: ${url}`);
    }

    return await response.json();
}


async function getAllTideData_temp(lat,lng, date,time) {
    const station_temp = findNearestSorted(lat, lng, stations_temp);  
    let file_date = await loadTempData(date);
    console.log(time);
    for (let i = 0; i < 3; i++) {        
        try{
            let tideData_temp = null;
            let code = station_temp[i].code;
            
            tideData_temp = nearest_time(file_date[code],time);
            console.log(tideData_temp.temp,station_temp[i].type,station_temp[i].code,station_temp[i].name);
            
            if (tideData_temp != null) {                    
                    return {
                        temp: tideData_temp.temp,
                        //distance: station_temp[i].distance
                        distance: `${Math.round(station_temp[i].distance)}km`
                    };
            }  
            
        }catch(err){
            console.log(`실패 (${station_temp[i].name})`, err.message);
            continue;
        }
        
    }

    
}


function nearest_time(tempList, currentTime) {
    const [curHour, curMin] = currentTime.split(':').map(Number);
    const currentMinutes = curHour * 60 + curMin;
    let nearest = null;
    let minDiff = Infinity;
    for (const item of tempList) {
        const [hour, min] = item.time.split(':').map(Number);
        const itemMinutes = hour * 60 + min;
        const diff = Math.abs(itemMinutes - currentMinutes);
        if (diff < minDiff) {
            minDiff = diff;
            nearest = item;
        }
    }
    return nearest;
}







    
