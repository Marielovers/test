/* js/game.js */

// DOM Elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const uiHpBar = document.getElementById('hp-bar');
const uiHpText = document.getElementById('hp-text');
const uiXpBar = document.getElementById('xp-bar');
const uiXpText = document.getElementById('xp-text');
const uiBossUi = document.getElementById('boss-ui'); 
const uiBossHpBar = document.getElementById('boss-hp-bar');
const uiBossHpText = document.getElementById('boss-hp-text');
const uiScore = document.getElementById('scoreBoard');
const uiBombText = document.getElementById('bombText');

const titleScreen = document.getElementById('title-screen');
const loadoutScreen = document.getElementById('loadout-screen');
const gameUI = document.getElementById('ui');
const missionStartBtn = document.getElementById('mission-start-btn');

const modal = document.getElementById('upgrade-modal');
const selectUi = document.getElementById('select-ui');
const replaceUi = document.getElementById('replace-ui');
const cardList = document.getElementById('card-list');

// Game Variables
let gameState = "title"; 
let fps = 60;
let fpsInterval = 1000 / fps;
let now, then, elapsed;
let score = 0;
let frame = 0;
let nextSpawnFrame = 0;
let flashTimer = 0; 
let bossCooldown = 0; 
let bossMaxHp = 100;

let selectedLoadoutLeft = null;
let selectedLoadoutRight = null;

const player = {
    x: canvas.width / 2 - 25, y: canvas.height - 80, width: 50, height: 40, 
    speed: 7.5, hp: 100, maxHp: 100, bombs: 3, level: 1, currentExp: 0, maxExp: 50, 
    invincible: false, invincibleTimer: 0,
    leftPart: { id: null, level: 1 }, rightPart: { id: null, level: 1 },
    leftCooldown: 0, rightCooldown: 0, 
    // Part Specific States
    IfritOrbs: [], IfritRotation: 0, elenaDrones: [],
    leftLaser: { active: false, timer: 0 }, rightLaser: { active: false, timer: 0 }
};

// [신규] 터치 컨트롤 관련 변수
let lastTouchX = null;
let lastTouchY = null;
let lastTapTime = 0;

let boss = null; 
let bullets = [];
let enemyBullets = [];
let enemies = [];
let expOrbs = [];
let particles = [];

let upgradeSelectedIndex = 0;
let replaceSelection = 'left'; // 'left', 'right', 'cancel'
let currentUpgradeChoices = [];
let selectedNewPartId = null;

const keys = { ArrowUp:false, ArrowDown:false, ArrowLeft:false, ArrowRight:false, KeyZ: false };

function initGame() {
    // 키보드 이벤트 (PC용)
    document.addEventListener('keydown', e => { 
        if(keys.hasOwnProperty(e.code)) keys[e.code]=true; 
        if (gameState === "playing") { if (e.code === 'KeyZ' && !e.repeat) useBomb(); }
        if (gameState === "paused") { handleUpgradeKey(e.code); }
    });
    document.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.code)) keys[e.code]=false; });

    // [핵심 로직] 터치 이벤트 등록 (조이스틱 제거, 화면 드래그 방식 적용)
    const gameContainer = document.getElementById('game-container');

    gameContainer.addEventListener('touchstart', (e) => {
        // *** [수정됨] 게임 중이 아닐 때는 기본 동작(클릭)을 막지 않음 ***
        if (gameState !== "playing") return;

        e.preventDefault(); // 게임 중일 때만 스크롤 방지
        const touch = e.changedTouches[0];
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;

        // 더블 탭 폭탄 감지
        const currentTime = Date.now();
        if (currentTime - lastTapTime < 300) { // 300ms 이내 두 번 탭
            useBomb();
        }
        lastTapTime = currentTime;

    }, {passive: false});

    gameContainer.addEventListener('touchmove', (e) => {
        if (gameState !== "playing") return; // 게임 중이 아니면 리턴
        e.preventDefault();

        const touch = e.changedTouches[0];
        const dx = touch.clientX - lastTouchX;
        const dy = touch.clientY - lastTouchY;

        // 캔버스와 실제 표시 크기 간의 비율 보정
        // 화면 크기가 변해도 1:1 드래그 감각을 유지하기 위함
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        // 기체 이동 적용 (드래그한 만큼 즉시 이동)
        player.x += dx * scaleX;
        player.y += dy * scaleY;

        // 화면 밖 제한
        if (player.x < 0) player.x = 0;
        if (player.x > canvas.width - player.width) player.x = canvas.width - player.width;
        if (player.y < 0) player.y = 0;
        if (player.y > canvas.height - player.height) player.y = canvas.height - player.height;

        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
    }, {passive: false});

    gameContainer.addEventListener('touchend', (e) => {
            // 게임 중일 때만 처리
            if (gameState === "playing") {
            e.preventDefault();
            lastTouchX = null;
            lastTouchY = null;
            }
    });
}

// 현재 어느 쪽을 선택 중인지 추적하는 변수 ('left' 또는 'right')
let currentSelectionTarget = 'left';

function goToLoadout() {
    gameState = "loadout";
    titleScreen.style.display = "none";
    loadoutScreen.style.display = "flex";
    
    // 초기화
    selectedLoadoutLeft = null;
    selectedLoadoutRight = null;
    setSelectionTarget('left'); // 처음엔 왼쪽부터 선택
    renderLoadoutUI();
}

function setSelectionTarget(side) {
    currentSelectionTarget = side;
    
    document.getElementById('slot-left').classList.remove('active');
    document.getElementById('slot-right').classList.remove('active');
    document.getElementById(`slot-${side}`).classList.add('active');

    const guide = document.getElementById('selection-guide');
    guide.innerText = side === 'left' ? "◀ Choose LEFT Part" : "Choose RIGHT Part ▶";
    guide.style.color = side === 'left' ? "#00f0ff" : "#ff00ff";
    renderLoadoutUI();
}

function renderLoadoutUI() {
    const grid = document.getElementById('unified-part-grid');
    grid.innerHTML = '';

    Object.keys(PARTS_INFO).forEach(key => {
        let info = PARTS_INFO[key];
        let div = document.createElement('div');
        div.className = 'mini-card';
        if (currentSelectionTarget === 'left' && selectedLoadoutRight === key) {
            div.classList.add('in-use');
        }
        else if (currentSelectionTarget === 'right' && selectedLoadoutLeft === key) {
            div.classList.add('in-use');
        }

        if (currentSelectionTarget === 'left' && selectedLoadoutLeft === key) {
            div.classList.add('selected');
        }
        if (currentSelectionTarget === 'right' && selectedLoadoutRight === key) {
            div.classList.add('selected');
        }

        div.onclick = () => selectPart(key); 
        div.innerHTML = `
            <div class="mini-icon" style="background:${info.color}; border-radius:50%;"></div>
            <div class="mini-name">${info.name}</div>
        `;
        grid.appendChild(div);
    });

    updateSlotVisuals(); 
    checkStartButton(); 
}

function selectPart(key) {
    if (currentSelectionTarget === 'left') {
        selectedLoadoutLeft = key;
        if (selectedLoadoutRight === null) {
            setSelectionTarget('right');
        }
    } else {
        selectedLoadoutRight = key;
    }
    updateSlotVisuals();
    checkStartButton();
    renderLoadoutUI();
}

function updateSlotVisuals() {
    updateSingleSlot('left', selectedLoadoutLeft);
    updateSingleSlot('right', selectedLoadoutRight);
}

function updateSingleSlot(side, key) {
    const slot = document.getElementById(`slot-${side}`);
    const iconDiv = document.getElementById(`preview-${side}-icon`);
    const nameDiv = document.getElementById(`preview-${side}-name`);

    if (key) {
        let info = PARTS_INFO[key];
        slot.classList.add('filled');
        iconDiv.style.background = info.color;
        nameDiv.innerText = info.name;
        nameDiv.style.color = info.color;
    } else {
        slot.classList.remove('filled');
        iconDiv.style.background = '#333';
        nameDiv.innerText = (side === 'left' && currentSelectionTarget === 'left') ? "SELECT" : "WAITING...";
        nameDiv.style.color = '#aaa';
    }
}

function checkStartButton() {
    if (selectedLoadoutLeft && selectedLoadoutRight) {
        missionStartBtn.disabled = false;
        missionStartBtn.style.borderColor = "#00f0ff";
        missionStartBtn.style.color = "white";
        missionStartBtn.style.boxShadow = "0 0 20px #00f0ff";
        document.getElementById('selection-guide').innerText = "READY TO LAUNCH!";
        document.getElementById('selection-guide').style.color = "#fff";
    } else {
        missionStartBtn.disabled = true;
        missionStartBtn.style.borderColor = "#555";
        missionStartBtn.style.color = "#555";
        missionStartBtn.style.boxShadow = "none";
    }
}
function startGame() {
    gameState = "playing";
    loadoutScreen.style.display = "none";
    gameUI.style.display = "block";

    player.leftPart = { id: selectedLoadoutLeft, level: 1 };
    player.rightPart = { id: selectedLoadoutRight, level: 1 };
    
    score = 0; frame = 0; player.hp = 100; player.bombs = 3; player.level = 1; player.currentExp = 0; player.maxExp = 50;
    player.elenaDrones = []; player.IfritOrbs = []; player.barieDrones = []; 
    player.naiaDrones = []; player.barieNaiaDrones = []; player.naiaRotation = 0;
    player.naiaTimer = 0;  player.naiaCurrentCount = 2; player.silphirTimer = 0; player.nerOrbs = [];

    player.leftLaser = {active: false, timer: 0, angle: -Math.PI / 2}; 
    player.rightLaser = {active: false, timer: 0, angle: -Math.PI / 2};

    player.gabiaShield = 0;
    player.gabiaMaxShield = 0;
    player.gabiaState = 'active'; 
    player.gabiaHitTimer = 0; 

    player.leftCooldown = 0;
    player.rightCooldown =6;

    player.totalHitCount = 0; 
    player.suroTimer = 0;     

    enemies = []; bullets = []; enemyBullets = []; expOrbs = []; particles = []; boss = null;
    bossCooldown = 0; bossMaxHp = 100;
    updatePlayerStats();
    
    if (player.gabiaMaxShield > 0) {
        player.gabiaShield = player.gabiaMaxShield;
    }
    then = Date.now();
    startTime = then;
    updatePlayerStats();

    updateUI();
    animate();
}

function handleUpgradeKey(code) {
    if (selectUi.style.display !== 'none') {
        if (code === 'ArrowRight') {
            if(upgradeSelectedIndex < 2) upgradeSelectedIndex++;
            else if(upgradeSelectedIndex === 3) upgradeSelectedIndex = 4;
        }
        if (code === 'ArrowLeft') {
            if(upgradeSelectedIndex > 0 && upgradeSelectedIndex <= 2) upgradeSelectedIndex--;
            else if(upgradeSelectedIndex === 4) upgradeSelectedIndex = 3;
        }
        if (code === 'ArrowDown') {
            if(upgradeSelectedIndex <= 1) upgradeSelectedIndex = 3;
            else if(upgradeSelectedIndex === 2) upgradeSelectedIndex = 4;
        }
        if (code === 'ArrowUp') {
            if(upgradeSelectedIndex === 3) upgradeSelectedIndex = 1;
            else if(upgradeSelectedIndex === 4) upgradeSelectedIndex = 2;
        }
        if (code === 'KeyZ') confirmSelection();
        updateUpgradeVisuals();
    } else {
        if (code === 'ArrowLeft') {
            if(replaceSelection === 'right') replaceSelection = 'left';
        }
        if (code === 'ArrowRight') {
            if(replaceSelection === 'left') replaceSelection = 'right';
        }
        if (code === 'ArrowDown') {
            if(replaceSelection === 'left' || replaceSelection === 'right') replaceSelection = 'cancel';
        }
        if (code === 'ArrowUp') {
            if(replaceSelection === 'cancel') replaceSelection = 'left';
        }

        if (code === 'KeyZ') {
            if (replaceSelection === 'cancel') cancelReplace();
            else replacePart(replaceSelection);
        }
        if (code === 'Escape') cancelReplace();
        
        updateReplaceVisuals();
    }
}

function updateUpgradeVisuals() {
    const cards = document.querySelectorAll('.card');
    const btnHeal = document.getElementById('btn-heal');
    const btnBomb = document.getElementById('btn-bomb');
    cards.forEach(c => c.classList.remove('highlighted'));
    btnHeal.classList.remove('highlighted');
    btnBomb.classList.remove('highlighted');
    if (upgradeSelectedIndex <= 2) { if(cards[upgradeSelectedIndex]) cards[upgradeSelectedIndex].classList.add('highlighted'); } 
    else if (upgradeSelectedIndex === 3) { btnHeal.classList.add('highlighted'); } 
    else if (upgradeSelectedIndex === 4) { btnBomb.classList.add('highlighted'); }
}

function updateReplaceVisuals() {
    const btnLeft = document.getElementById('btn-replace-left');
    const btnRight = document.getElementById('btn-replace-right');
    const btnCancel = document.getElementById('btn-replace-cancel');

    btnLeft.classList.remove('highlighted');
    btnRight.classList.remove('highlighted');
    btnCancel.classList.remove('highlighted');

    if(replaceSelection === 'left') btnLeft.classList.add('highlighted');
    else if(replaceSelection === 'right') btnRight.classList.add('highlighted');
    else if(replaceSelection === 'cancel') btnCancel.classList.add('highlighted');
}

function confirmSelection() {
    if (upgradeSelectedIndex <= 2) {
        let partId = currentUpgradeChoices[upgradeSelectedIndex];
        let isOwned = (player.leftPart.id === partId || player.rightPart.id === partId);
        let currentLevel = 0;
        if(player.leftPart.id === partId) currentLevel = player.leftPart.level;
        else if(player.rightPart.id === partId) currentLevel = player.rightPart.level;
        if (!(isOwned && currentLevel >= 5)) { selectUpgradePart(partId); }
    } else if (upgradeSelectedIndex === 3) { selectFixedUpgrade('heal'); } 
    else if (upgradeSelectedIndex === 4) { selectFixedUpgrade('bomb'); }
}

function animate() {
    requestAnimationFrame(animate);

    now = Date.now();
    elapsed = now - then;

    if (elapsed > fpsInterval) {
        then = now - (elapsed % fpsInterval);

        if (gameState !== "playing") return;

        if (frame % 60 === 0) {
            let totalRegen = 0;
            if (player.leftPart.id === 'asana' && !player.invincible ) { totalRegen += ((player.leftPart.level) *0.1 ); }
            if (player.rightPart.id === 'asana' && !player.invincible ) { totalRegen += ((player.rightPart.level) *0.1 ); }
            if (totalRegen > 0) {
                player.hp = Math.min(player.maxHp, player.hp + totalRegen);
                updateUI();
                createParticles(player.x + 25, player.y + 20, '#44ff44');
            }
        }

        let hasSilphir = (player.leftPart.id === 'silphir' || player.rightPart.id === 'silphir' ||
                        (player.leftPart.id === 'barie' && player.rightPart.id === 'silphir') ||
                        (player.rightPart.id === 'barie' && player.leftPart.id === 'silphir'));
        
        if (gameState === "playing") {
            if (hasSilphir) { player.silphirTimer++; } 
            else { player.silphirTimer = 0; }
        }

        let hasSuro = (player.leftPart.id === 'suro' || player.rightPart.id === 'suro');
        let hasDiana = (player.leftPart.id === 'diana' || player.rightPart.id === 'diana');

        if (hasSuro && hasDiana && gameState === "playing") {
            player.suroTimer++;
            if (player.suroTimer >= 600) {
                player.suroTimer = 0;
                if (player.hp > 0) {
                    player.hp -= 1;
                    player.totalHitCount++;
                    createParticles(player.x + 25, player.y + 20, '#800000');
                    updateUI();
                    if (player.hp <= 0) { drawGameOver(); return; }
                }
            }
        }

        try {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (flashTimer > 0) {
                ctx.fillStyle = `rgba(255, 255, 255, ${flashTimer / 20})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                flashTimer--;
            }
            if (player.hp > 0) {
                updatePlayerMove();
                updatePlayerAction(); 
                updateElenaDrones(); 
                drawPlayer();
                drawElenaDrones();    
            } else {
                drawGameOver();
                return;
            }
            updateNerOrbs();
            updateBullets();
            updateEnemies();
            updateBoss();
            updateExpOrbs();
            updateParticles();
            checkCollisions(); 
            updateGabiaShield();
            frame++;
        } catch (err) { console.error(err); }
        
        updateElenaDrones();
        updateNaiaDrones();
        drawPlayer();
        drawElenaDrones();
        drawNaiaDrones();
    }
}

function updatePlayerAction() {
    processPartAction(player.leftPart, 'left'); 
    processPartAction(player.rightPart, 'right');
    
    player.IfritRotation += 0.075; 
    const count = player.IfritOrbs.length;

    if (count > 0) {
        let ameliaLevel = 0;
        if (player.leftPart.id === 'amelia ') ameliaLevel += player.leftPart.level;
        if (player.rightPart.id === 'amelia ') ameliaLevel += player.rightPart.level;

        const detectionRange = 200 + (ameliaLevel * 50);

        let targets = [...enemies];
        if (boss) targets.push(boss);

        for (let i = player.IfritOrbs.length - 1; i >= 0; i--) {
            let orb = player.IfritOrbs[i];

            if (orb.homing) {
                orb.x += orb.vx;
                orb.y += orb.vy;

                if (orb.x < -50 || orb.x > canvas.width + 50 || orb.y < -50 || orb.y > canvas.height + 50) {
                    player.IfritOrbs.splice(i, 1);
                }
                continue; 
            }

            let angleOffset = (Math.PI * 2 / count) * i;
            let currentAngle = player.IfritRotation + angleOffset;

            let orbitRadius = (orb.source === 'barie') ? 80 : 60;
            
            let orbitX = (player.x + player.width/2) + Math.cos(currentAngle) * orbitRadius;
            let orbitY = (player.y + player.height/2) + Math.sin(currentAngle) * orbitRadius;

            let launched = false;
            if (targets.length > 0) {
                let closest = null;
                let minDist = Infinity;

                targets.forEach(t => {
                    let dist = Math.hypot((t.x + t.width/2) - orbitX, (t.y + t.height/2) - orbitY);
                    if (dist < minDist) { minDist = dist; closest = t; }
                });

                if (closest && minDist <= detectionRange) {
                    orb.homing = true; 
                    
                    let angle = Math.atan2((closest.y + closest.height/2) - orbitY, (closest.x + closest.width/2) - orbitX);
                    let speed = 12; 
                    
                    orb.vx = Math.cos(angle) * speed;
                    orb.vy = Math.sin(angle) * speed;
                    
                    orb.x = orbitX;
                    orb.y = orbitY;
                    launched = true;
                }
            }

            if (!launched) {
                orb.x = orbitX;
                orb.y = orbitY;
            }
        }
    }
}

function processPartAction(part, side) {
    let runPart = part;
    let partner = (side === 'left') ? player.rightPart : player.leftPart;

    if (part.id === 'barie') {
        if (partner.id === 'lethe') return;
        runPart = { id: partner.id, level: part.level };
    }
    if(runPart.id === 'elena') return;

    let hasLeets = (player.leftPart.id === 'leets' || player.rightPart.id === 'leets');
    let haleyLevel = 0;
    if(player.leftPart.id === 'haley') haleyLevel = Math.max(haleyLevel, player.leftPart.level);
    if(player.rightPart.id === 'haley') haleyLevel = Math.max(haleyLevel, player.rightPart.level);
    
    let isBerserk = hasLeets && player.invincible;
    let isOffmask = (player.leftPart.id === 'rim' || player.rightPart.id === 'rim') && player.invincible;

    if (runPart.id === 'lethe') {
        let laser = (side === 'left') ? player.leftLaser : player.rightLaser;
        let cdKey = side + 'Cooldown';

        let isBoosted = (partner.id === 'barie');
        
        if (typeof laser.angle === 'undefined') laser.angle = -Math.PI / 2;
        
        let ameliaLevel = 0;
        if (player.leftPart.id === 'amelia') ameliaLevel += player.leftPart.level;
        if (player.rightPart.id === 'amelia') ameliaLevel += player.rightPart.level;
        
        let ox;
        if (isBoosted) {
            ox = player.x + 25;
        } else {
            ox = (side === 'left') ? player.x + 10 : player.x + 40;
        }
        let oy = player.y;

        if (laser.active) {
            laser.timer--;
            if (!laser.acc) laser.acc = 0;

            let currentSpeedMult = 0;
            if (isOffmask) currentSpeedMult = 1;
            if (isBoosted) currentSpeedMult = 1;

            laser.acc += Math.max(1, 1+currentSpeedMult);
            
            if (ameliaLevel > 0) {
                let closest = null;
                let minDist = Infinity;
                let targets = [...enemies];
                if (boss) targets.push(boss);

                targets.forEach(t => {
                    let dx = (t.x + t.width/2) - (player.x + 25);
                    let dy = (t.y + t.height/2) - (player.y + 20);
                    let dist = dx*dx + dy*dy;
                    if (dist < minDist) { minDist = dist; closest = t; }
                });

                let targetAngle = -Math.PI / 2;
                if (closest) {
                    let tx = closest.x + closest.width/2;
                    let ty = closest.y + closest.height/2;
                    targetAngle = Math.atan2(ty - (player.y + 20), tx - (player.x + 25));
                }

                let turnSpeed = 0.02 + (ameliaLevel * 0.01);
                let diff = targetAngle - laser.angle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;

                if (Math.abs(diff) < 0.01) laser.angle = targetAngle;
                else laser.angle += diff * turnSpeed

            } else {
                laser.angle = -Math.PI / 2;
            }

            if (laser.acc >= 6) {
                laser.acc -= 6;
                
                let baseW = 2 + (runPart.level - 1) * 0.5; 
                let lw = isBoosted ? baseW * 1.5 : baseW;
                let damageMultiplier = 1.0;
                let damageAdd = 0;
                if (player.leftPart.id === 'leets') damageMultiplier += 0.20 + (player.leftPart.level - 1) * 0.2;
                if (player.rightPart.id === 'leets') damageMultiplier += 0.20 + (player.rightPart.level - 1) * 0.2;
                if (isBerserk) damageAdd = 1 ;
                let damage = (2 + (runPart.level - 1) * 0.5) * damageMultiplier*getSilphirMultiplier() + damageAdd; 

                const checkLaserHit = (target, lx, ly, angle, width, range) => {
                    let tx = target.x + target.width/2;
                    let ty = target.y + target.height/2;
                    let vx = Math.cos(angle);
                    let vy = Math.sin(angle);
                    let pdx = tx - lx;
                    let pdy = ty - ly;
                    let dot = pdx * vx + pdy * vy;
                    if (dot < 0 || dot > range) return false;
                    let distSq = (pdx*pdx + pdy*pdy) - (dot*dot);
                    let targetRadius = target.width / 2;
                    let hitDist = (width/2) + targetRadius;
                    return distSq < (hitDist * hitDist);
                };

                let lx = player.x + 25; 
                let ly = player.y + 20; 
                let range = 1000;       

                enemies.forEach((e, idx) => {
                    if (checkLaserHit(e, ox, oy, laser.angle, lw, range)) {
                        e.hp -= damage; e.hitTimer = 5;
                        createParticles(e.x + e.width/2, e.y + e.height/2, 'red');
                        applyDianaLifesteal(damage);
                        if (e.hp <= 0) { enemies.splice(idx, 1); score += 100; spawnExpOrb(e.x, e.y); }
                    }
                });

                if (boss && checkLaserHit(boss, lx, ly, laser.angle, lw, range)) {
                    boss.hp -= damage; boss.hitTimer = 5; createParticles(boss.x + boss.width/2, boss.y + boss.height/2, 'red');
                    applyDianaLifesteal(damage);
                    if (boss.hp <= 0) killBoss();
                }
                
                for (let i = enemyBullets.length - 1; i >= 0; i--) {
                    let eb = enemyBullets[i];
                    let ebObj = {x: eb.x - 5, y: eb.y - 5, width: 10, height: 10}; 
                    if (checkLaserHit(ebObj, lx, ly, laser.angle, lw, range)) {
                        enemyBullets.splice(i, 1);
                        createParticles(eb.x, eb.y, 'orange');
                    }
                }
            }

            if (laser.timer <= 0) {
                laser.active = false;
                laser.acc = 0;
                player[cdKey] = isOffmask ? 0 : (300 - 40*(haleyLevel));
            }
            return; 
        } else {
            if (isOffmask) player[cdKey] = 0;
            if (player[cdKey] > 0) { player[cdKey]--; return; } 
            else { laser.active = true; laser.timer = 300; return; }
        }
    }

    let cdKey = side + 'Cooldown'; if (player[cdKey] > 0) player[cdKey]--;
    
    if (player[cdKey] <= 0) {
        let baseCd = 0;
        let bx = side === 'left' ? player.x + 10 : player.x + player.width - 10;
        
        if (runPart.id === 'tig') {
            baseCd = Math.floor(6 / (1 + (runPart.level - 1) * 0.25)); 
            let x1 = side === 'left' ? player.x + 5 : player.x + 30; let x2 = side === 'left' ? player.x + 20 : player.x + 45;
            spawnBullet(x1, player.y, 0, -22, 6, 6, 'dimgray', 0.5); spawnBullet(x2, player.y, 0, -22, 6, 6, 'dimgray', 0.5); 
        } else if (runPart.id === 'leets') {
            baseCd = 12; spawnBullet(bx, player.y, 0, -22, 8, 8, '#a020f0', 1, 'circle');
        } else if (runPart.id === 'Ifrit') {
            let currentSource = (part.id === 'barie') ? 'barie' : 'Ifrit';
            let myOrbCount = player.IfritOrbs.filter(orb => orb.source === currentSource).length;
            let maxOrbs = 5 + (runPart.level * 2);
            if (myOrbCount < maxOrbs) { 
                let baseDmg = 5 * (1 + (runPart.level - 1) * 0.25);
                let damageMultiplier = 1.0;
                let damageAdd = 0;
                if (player.leftPart.id === 'leets') damageMultiplier += 0.20 + (player.leftPart.level - 1) * 0.2;
                if (player.rightPart.id === 'leets') damageMultiplier += 0.20 + (player.rightPart.level - 1) * 0.2;
                if (isBerserk) damageAdd = 1 ;
                let orbColor = '#333'; 
                if (part.id === 'barie') {
                orbColor = '#d000ff'; 
                }
                player.IfritOrbs.push({ w:10, h:10, color: orbColor, damage: baseDmg * damageMultiplier * getSilphirMultiplier() + damageAdd, x:0, y:0, source: currentSource}); 
                baseCd = 20; 
            } 
        } else if (runPart.id === 'pira') { spawnBullet(bx, player.y, 0, -22, 8, 8, '#ffd700', 1, 'circle'); baseCd = 12; } 
        else if (runPart.id === 'diana') { spawnBullet(bx, player.y, 0, -22, 8, 8, '#8b4513', 1, 'circle'); baseCd = 12; }
        else if (runPart.id === 'asana') { spawnBullet(bx, player.y, 0, -22, 8, 8, 'green', 1, 'circle'); baseCd = 12; }
        else if (runPart.id === 'shady') { spawnBullet(bx, player.y, 0, -22, 8, 8, 'grey', 1, 'circle'); baseCd = 12; }
        else if (runPart.id === 'haley') { spawnBullet(bx, player.y, 0, -22, 8, 8, 'green', 1, 'circle'); baseCd = 12; }
        else if (runPart.id === 'gabia') { spawnBullet(bx, player.y, 0, -20, 8, 8, '#8B4513', 1, 'circle'); baseCd = 12; }
        else if (runPart.id === 'amelia') { spawnBullet(bx, player.y, 0, -20, 8, 8, 'grey', 1, 'circle'); baseCd = 12; }
        else if (runPart.id === 'silphir') { spawnBullet(bx, player.y, 0, -20, 8, 8, 'blue', 1, 'circle'); baseCd = 12; }
        else if (runPart.id === 'barie') { 
            spawnBullet(bx, player.y, 0, -20, 6, 8, 'purple', 1, 'circle'); baseCd = 12; 
        }
        else if (runPart.id === 'shasha') {
            let bulletCount = 5 + (runPart.level - 1) * 1; 
            let dmg = 0.5; 
            let maxSpread = Math.PI / 4; 
            let startAngle = -Math.PI / 2 - maxSpread / 2;
            let totalArc = maxSpread;
            for (let i = 0; i < bulletCount; i++) {
                let angle = -Math.PI / 2;
                if (bulletCount > 1) { angle = startAngle + (totalArc * i / (bulletCount - 1)); }
                let vx = Math.cos(angle) * 15; let vy = Math.sin(angle) * 15;
                spawnBullet(bx, player.y, vx, vy, 6, 6, 'navy', dmg, 'circle');
            }
            baseCd = 12; 
        } else if (runPart.id === 'rim') {
            let count = 3 + (runPart.level - 1); 
            let spacing = 12; 
            let startX = bx - ((count - 1) * spacing) / 2; 
            for (let i = 0; i < count; i++) {
                spawnBullet(startX + (i * spacing), player.y, 0, -22, 5, 10, 'red', 0.5);
            }
            baseCd = 12; 
        }
        else if (runPart.id === 'Belita') {
            let hpRatio = player.hp / 100;
            let baseDmg = Math.max(1, 3 * (hpRatio * hpRatio) * (1+(runPart.level - 1) * 0.25));    
            let bulletSize = Math.max(3,  8 * hpRatio* (1+(runPart.level - 1) * 0.25));
            spawnBullet(bx, player.y, 0, -18, bulletSize, bulletSize, 'red', baseDmg, 'circle');  
            baseCd = 12; 
        }
        else if (runPart.id === 'kidian') {
            let levelBonus = runPart.level * player.level * 0.01;
            let piraBonus = 1;
            if (partner.id === 'pira') {
                piraBonus = 1 + partner.level*0.3; 
            }
            let finalBaseDmg = Math.max(0.2, levelBonus) * piraBonus ; 

            let startX = bx - 12; 
            for (let i = 0; i < 3; i++) {
                spawnBullet(startX + (i * 12), player.y, 0, -22, 5, 10, 'black', finalBaseDmg,'circle');
            }
            for (let i = 0; i < 2; i++) {
                let angle = -Math.PI / 2;
                angle = -Math.PI * 5 / 8 + (Math.PI / 4 * i );
                let vx = Math.cos(angle) * 15; let vy = Math.sin(angle) * 15;
                spawnBullet(bx, player.y, vx, vy, 6, 6, 'black', finalBaseDmg);
            }
            baseCd = 12; 
        }

        else if (runPart.id === 'suro') {
            let hitBonus = Math.min(1.0, player.totalHitCount * 0.01);
            let baseDmg = 0.5 * (1 + (runPart.level - 1) * 0.25);
            let finalDmg = baseDmg * (1 + hitBonus);
            let speedY = -20; 
            spawnBullet(bx, player.y, 0, speedY, 6, 10, 'black', finalDmg);
            let bLeft = spawnBullet(bx - 10, player.y, -0.5, speedY, 6, 10, 'black', finalDmg);
            bLeft.trajectory = 'sine'; bLeft.timer = 10; bLeft.sidePhase = 1; 
            let bRight = spawnBullet(bx + 10, player.y, 0.5, speedY, 6, 10, 'black', finalDmg);
            bRight.trajectory = 'sine'; bRight.timer = 10; bRight.sidePhase = -1;       
            baseCd = 12; 
        }
        else if (runPart.id === 'erpin') {
            let hasNer = (partner.id === 'ner');

            let lazyChance = 0.2; 
            if (hasNer) lazyChance = 0.4; 

            if (Math.random() < lazyChance) {
                if (hasNer && lazyChance < 0.2) {
                    if (hasNer && lazyChance < 0.002) {
                        player.bombs++;
                        createParticles(bx, player.y, '#00ff00'); 
                        console.log("Erpin found a marie"); 
                        updateUI();
                    }
                } else {
                player.hp = Math.min(player.maxHp, player.hp + 1);
                }
    
                createParticles(bx, player.y, '#00ff00');
                updateUI(); 
            } else {
                let count = 8 + (runPart.level - 1) * 2;
                
                for (let i = 0; i < count; i++) {
                    let angle = (Math.random()-0.5- Math.PI) / 2; 
                    let speed = 10 + Math.random() * 10;

                    let vx = Math.cos(angle) * speed;
                    let vy = Math.sin(angle) * speed;

                    spawnBullet(bx, player.y, vx, vy, 5, 5, '#FFD700', 0.4, 'circle');
                }
            }

            baseCd = 20; 
        }

        else if (runPart.id === 'ner') {
            let hasErpin = (partner.id === 'erpin');

            let traitorChance = 0.2;
            if (hasErpin) traitorChance = 0;

            let isTraitor = (Math.random() < traitorChance);

            player.nerOrbs.push({
                x: bx,
                y: player.y,
                vx: (Math.random() - 0.5) * 2, 
                vy: -5, 
                width: 20, 
                height: 20,
                isEnemy: isTraitor, 
                timer: 0,
                level: runPart.level,
                explodeTime: 60 + Math.random() * 60 
            });

            baseCd = 60; 
        }

        let speedMult = 1 + (haleyLevel) * 0.1;
        if (isOffmask && baseCd > 0) {
            speedMult *= 2
        }
        baseCd = Math.floor(baseCd / speedMult);
        if (baseCd > 0) player[cdKey] = baseCd;
    }
}
function updateElenaDrones() {

    let elenaTargetCount = 0;
    let barieTargetCount = 0;

    if (player.leftPart.id === 'elena') elenaTargetCount += player.leftPart.level;
    if (player.rightPart.id === 'elena') elenaTargetCount += player.rightPart.level;

    if (player.leftPart.id === 'barie' && player.rightPart.id === 'elena') {
        barieTargetCount += player.leftPart.level;
    }
    if (player.rightPart.id === 'barie' && player.leftPart.id === 'elena') {
        barieTargetCount += player.rightPart.level;
    }
    let isOffmask = (player.leftPart.id === 'rim' || player.rightPart.id === 'rim') && player.invincible;

    while (player.elenaDrones.length < elenaTargetCount) player.elenaDrones.push({ x: player.x, y: player.y, cooldown: 0 });
    while (player.elenaDrones.length > elenaTargetCount) player.elenaDrones.pop();

    while (player.barieDrones.length < barieTargetCount) player.barieDrones.push({ x: player.x, y: player.y, cooldown: 0 });
    while (player.barieDrones.length > barieTargetCount) player.barieDrones.pop();

    let ameliaLevel = 0;
    if (player.leftPart.id === 'amelia') ameliaLevel += player.leftPart.level;
    if (player.rightPart.id === 'amelia') ameliaLevel += player.rightPart.level;
    if (player.leftPart.id === 'barie' && player.rightPart.id === 'amelia') ameliaLevel += player.leftPart.level;
    if (player.rightPart.id === 'barie' && player.leftPart.id === 'amelia') ameliaLevel += player.rightPart.level;

    let haleyLevel = 0;
    if (player.leftPart.id === 'haley') haleyLevel = Math.max(haleyLevel, player.leftPart.level);
    if (player.rightPart.id === 'haley') haleyLevel = Math.max(haleyLevel, player.rightPart.level);

    const processDroneGroup = (drones, bulletColor, yOffset) => {
        let targetedEnemyIds = new Set();
        const getDist = (o1, o2) => Math.hypot(o1.x - o2.x, o1.y - o2.y);
        const spacing = 25; 
        let targetGroups = {}; 
        let playerKey = 'player_pos';

        drones.forEach((drone) => {
            let target = null;
            let bestDist = Infinity;
            let candidates = [...enemies];
            if (boss) candidates.push(boss);

            candidates.forEach(e => {
                if (!targetedEnemyIds.has(e.id)) {
                    let d = getDist(drone, e);
                    if (d < bestDist) { bestDist = d; target = e; }
                }
            });
            
            if (!target) {
                bestDist = Infinity;
                candidates.forEach(e => {
                    let d = getDist(drone, e);
                    if (d < bestDist) { bestDist = d; target = e; }
                });
            }

            if (target) {
                targetedEnemyIds.add(target.id);
                if (!targetGroups[target.id]) targetGroups[target.id] = { targetObj: target, drones: [] };
                targetGroups[target.id].drones.push(drone);
            } else {
                if (!targetGroups[playerKey]) targetGroups[playerKey] = { targetObj: null, drones: [] };
                targetGroups[playerKey].drones.push(drone);
            }
        });

        Object.values(targetGroups).forEach(group => {
            let target = group.targetObj;
            let dronesInGroup = group.drones;
            let groupSize = dronesInGroup.length;

            dronesInGroup.forEach((drone, localIndex) => {
                let offset = (localIndex - (groupSize - 1) / 2) * spacing;
                let destX, destY;
                if (target) {
                    destX = target.x + target.width / 2 + offset;
                    destY = target.y + target.height + 60 + yOffset;
                } else {
                    destX = player.x + player.width / 2 + offset;
                    destY = player.y + player.height / 2 + yOffset;
                }

                let dx = destX - drone.x;
                let dy = destY - drone.y;
                let dist = Math.hypot(dx, dy);
                let droneSpeed = 5 + (ameliaLevel * 2);

                if (dist > droneSpeed) {
                    drone.x += (dx / dist) * droneSpeed;
                    drone.y += (dy / dist) * droneSpeed;
                } else {
                    drone.x = destX;
                    drone.y = destY;
                }

                if (target && drone.cooldown <= 0) {
                    if (Math.abs(drone.x - destX) < 20) {
                        spawnBullet(drone.x, drone.y, 0, -25, 4, 10, bulletColor, 0.5); 
                        
                        let droneCd = 10;
                        let speedMult = 1
                        if (haleyLevel > 0 && !player.invincible) {
                            speedMult = 1 + haleyLevel * 0.1;
                            droneCd = Math.floor(droneCd / speedMult);
                        } else if (isOffmask) {
                            speedMult = 2;
                            droneCd = Math.floor(droneCd / speedMult);
                        }
                        drone.cooldown = droneCd; 
                    }
                }
                if (drone.cooldown > 0) drone.cooldown--;
            });
        });
    };

    if (player.elenaDrones.length > 0) processDroneGroup(player.elenaDrones, 'cyan', 0);
    if (player.barieDrones.length > 0) processDroneGroup(player.barieDrones, 'purple', 30);
}

function updateNaiaDrones() {
    let radius = 60; 
    
    let haleyLevel = 0;
    if (player.leftPart.id === 'haley') haleyLevel = Math.max(haleyLevel, player.leftPart.level);
    if (player.rightPart.id === 'haley') haleyLevel = Math.max(haleyLevel, player.rightPart.level);
    
    let isOffmask = (player.leftPart.id === 'rim' || player.rightPart.id === 'rim') && player.invincible;

    let speedMult = 1.0;
    if (haleyLevel > 0 && !player.invincible) speedMult += haleyLevel * 0.1;
    if (isOffmask) speedMult *= 2;

    let finalCooldown = Math.floor(6 / speedMult);

    let naiaLevel = 0;
    if (player.leftPart.id === 'naia') naiaLevel = Math.max(naiaLevel, player.leftPart.level);
    if (player.rightPart.id === 'naia') naiaLevel = Math.max(naiaLevel, player.rightPart.level);

    let barieLevel = 0;
    if (player.leftPart.id === 'barie' && player.rightPart.id === 'naia') barieLevel = player.leftPart.level;
    if (player.rightPart.id === 'barie' && player.leftPart.id === 'naia') barieLevel = player.rightPart.level;

    let hasSilphir = (player.leftPart.id === 'silphir' || player.rightPart.id === 'silphir');

    let hasNaia = (player.leftPart.id === 'naia' || player.rightPart.id === 'naia' ||
                    (player.leftPart.id === 'barie' && player.rightPart.id === 'naia') ||
                    (player.rightPart.id === 'barie' && player.leftPart.id === 'naia'));

    if (hasNaia) {
        player.naiaTimer++;
        if (player.naiaTimer >= 300) {
            player.naiaTimer = 0;
            player.naiaCurrentCount = Math.floor(Math.random() * 3) + 1;
            if (hasSilphir) player.naiaCurrentCount = Math.max(2 , player.naiaCurrentCount);
            createParticles(player.x + 25, player.y + 20, 'royalblue');
            console.log("Naia Protocol Updated: " + player.naiaCurrentCount + " Drones");
        }
    } else {
        player.naiaTimer = 0;
    }


    let naiaTarget = 0;
    let barieTarget = 0;
    
    if (player.leftPart.id === 'naia') {naiaTarget += player.naiaCurrentCount; player.naiaRotation += 0.07;}
    if (player.rightPart.id === 'naia') {naiaTarget += player.naiaCurrentCount; player.naiaRotation -= 0.07;}

    if (player.leftPart.id === 'barie' && player.rightPart.id === 'naia') barieTarget += player.naiaCurrentCount;
    if (player.rightPart.id === 'barie' && player.leftPart.id === 'naia') barieTarget += player.naiaCurrentCount;


    const updateDroneGroup = (dronesArray, targetCount, bulletColor, angleModifier, damageLevel, naiadronrotation) => {
        while (dronesArray.length < targetCount) {
            dronesArray.push({ x: player.x, y: player.y, cooldown: Math.random() * 20 });
        }
        while (dronesArray.length > targetCount) {
            dronesArray.pop();
        }

        dronesArray.forEach((drone, index) => {
            let spacingAngle = (Math.PI * 2) / dronesArray.length;
            let currentAngle = naiadronrotation + (spacingAngle * index) + angleModifier;

            drone.x = (player.x + 25) + Math.cos(currentAngle) * radius;
            drone.y = (player.y + 20) + Math.sin(currentAngle) * radius;

            if (drone.cooldown > 0) drone.cooldown--;
            else {
                let finalDmg = 0.5 + (damageLevel - 1) * 0.125; 
                spawnBullet(drone.x, drone.y, 0, -20, 4, 12, bulletColor, finalDmg, 'rect'); 
                drone.cooldown = finalCooldown; 
            }
        });
    };

    if (naiaTarget > 0) updateDroneGroup(player.naiaDrones, naiaTarget, 'royalblue', 0, naiaLevel, player.naiaRotation);
    
    if (barieTarget > 0) updateDroneGroup(player.barieNaiaDrones, barieTarget, 'purple', Math.PI / 4, barieLevel, player.naiaRotation*(-1));
}

function drawNaiaDrones() {
    const renderDrone = (drone, index, color, isBarie) => {
        ctx.save();
        ctx.translate(drone.x, drone.y);
        ctx.rotate(player.naiaRotation + (index * 1.5)); 

        ctx.fillStyle = color;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();

        if (!isBarie) {
            if (index === 0) { ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); } 
            else if (index === 1) { ctx.rect(-6, -6, 12, 12); } 
            else { ctx.arc(0, 0, 6, 0, Math.PI * 2); }
        } else {
            if (index === 0) { 
                ctx.moveTo(0, -8); ctx.lineTo(6, 0); ctx.lineTo(0, 8); ctx.lineTo(-6, 0); 
            } else if (index === 1) { 
                ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.lineTo(6, -6); 
            } else { 
                for (let i = 0; i < 6; i++) {
                    let angle = (Math.PI / 3) * i;
                    let px = Math.cos(angle) * 7;
                    let py = Math.sin(angle) * 7;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
            }
        }
        
        ctx.closePath(); 
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    };

    player.naiaDrones.forEach((d, i) => renderDrone(d, i, 'royalblue', false));
    
    player.barieNaiaDrones.forEach((d, i) => renderDrone(d, i, 'purple', true));
}

function drawElenaDrones() {
    ctx.fillStyle = 'cyan';
    player.elenaDrones.forEach(d => {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y - 10);
        ctx.lineTo(d.x - 5, d.y + 5);
        ctx.lineTo(d.x + 5, d.y + 5);
        ctx.fill();
    });
    ctx.fillStyle = 'purple';
    player.barieDrones.forEach(d => {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y - 10);
        ctx.lineTo(d.x - 5, d.y + 5);
        ctx.lineTo(d.x + 5, d.y + 5);
        ctx.fill();
    });
}

function spawnBullet(x, y, vx, vy, w, h, color, dmg, shape='rect') {
    let hasLeets = (player.leftPart.id === 'leets' || player.rightPart.id === 'leets');
    let isBerserk = hasLeets && player.invincible;
    let damageMultiplier = 1.0;
    let damageAdd = 0;
    if (player.leftPart.id === 'leets') damageMultiplier += 0.20 + (player.leftPart.level - 1) * 0.2;
    if (player.rightPart.id === 'leets') damageMultiplier += 0.20 + (player.rightPart.level - 1) * 0.2;
    if (isBerserk) damageAdd = 1;
    let silphirMult = getSilphirMultiplier();

    let finalDamage = dmg * damageMultiplier* silphirMult + damageAdd ;

    let newBullet = { x, y, vx, vy, width: w * 2, height: h * 2, color, damage: finalDamage, shape };
    bullets.push(newBullet);
    return newBullet; 
}

function updateBullets() {
    let homingStrength = 0;
    if (player.leftPart.id === 'amelia' && player.rightPart.id !== 'ner') homingStrength +=  (player.leftPart.level * 0.01);
    if (player.rightPart.id === 'amelia' && player.leftPart.id !== 'ner') homingStrength +=  (player.rightPart.level * 0.01);
    
    let targets = [...enemies];
    if (boss) targets.push(boss);

    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i]; 
        if (b.trajectory === 'sine') {
            b.timer += 0.15; 
            b.x += Math.cos(b.timer) * 5 * b.sidePhase;
        }
        if (homingStrength > 0 && targets.length > 0) {
            let closest = null;
            let minDist = Infinity;

            targets.forEach(t => {
                let dx = (t.x + t.width/2) - b.x;
                let dy = (t.y + t.height/2) - b.y;
                let dist = dx*dx + dy*dy; 
                if (dist < minDist) {
                    minDist = dist;
                    closest = t;
                }
            });

            if (closest) {
                let targetX = closest.x + closest.width/2;
                let targetY = closest.y + closest.height/2;
                let angle = Math.atan2(targetY - b.y, targetX - b.x);

                let speed = Math.hypot(b.vx, b.vy);
                
                let desiredVx = Math.cos(angle) * speed;
                
                b.vx += (desiredVx - b.vx) * homingStrength;
            }
        }

        b.x += b.vx; b.y += b.vy; ctx.fillStyle = b.color;
        if (b.shape === 'circle') { ctx.beginPath(); ctx.arc(b.x, b.y, b.width/2, 0, Math.PI*2); ctx.fill(); } else { ctx.fillRect(b.x - b.width/2, b.y, b.width, b.height); }
        if (b.y < -20) bullets.splice(i, 1);
    }
    player.IfritOrbs.forEach(orb => { ctx.fillStyle=orb.color; ctx.fillRect(orb.x-orb.w/2, orb.y-orb.h/2, orb.w, orb.h); });
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        let eb = enemyBullets[i]; eb.x += eb.vx; eb.y += eb.vy; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.radius || 6, 0, Math.PI*2); ctx.fillStyle = eb.color || 'orange'; ctx.fill();
        if (eb.y > canvas.height + 20 || eb.y < -20 || eb.x < -20 || eb.x > canvas.width + 20) enemyBullets.splice(i, 1);
    }
}

function fireRing(source, count, speed, bulletColor) {
    let angleStep = (Math.PI * 2) / count;
    for(let i=0; i<count; i++) {
        let angle = angleStep * i;
        enemyBullets.push({ x: source.x + source.width/2, y: source.y + source.height/2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 6, color: bulletColor });
    }
}
function fireSpiral(source, angleOffset, speed, bulletColor) {
    for(let i=0; i<2; i++) {
        let angle = angleOffset + (Math.PI * i); 
        enemyBullets.push({ x: source.x + source.width/2, y: source.y + source.height/2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 6, color: bulletColor });
    }
}
function fireAimedFan(source, count, spreadAngle, speed, bulletColor) {
    let px = player.x + player.width/2; let py = player.y + player.height/2;
    let bx = source.x + source.width/2; let by = source.y + source.height/2;
    let baseAngle = Math.atan2(py - by, px - bx);
    let startAngle = baseAngle - (spreadAngle / 2);
    let step = spreadAngle / (count - 1);
    for(let i=0; i<count; i++) {
        let angle = startAngle + step * i;
        enemyBullets.push({ x: bx, y: by, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 6, color: bulletColor });
    }
}

function spawnBoss() {
    enemies.forEach(e => spawnExpOrb(e.x, e.y));
    enemies = [];
    boss = {
        id: 'boss_' + frame,
        x: canvas.width/2 - 50, y: -100, width: 100, height: 100,
        hp: bossMaxHp, maxHp: bossMaxHp, 
        color: '#ff00ff',
        state: 'entering', patternTimer: 0, moveAngle: 0, hitTimer: 0
    };
    uiBossUi.style.display = 'block';
}

function updateBoss() {
    if (!boss) {
        if (bossCooldown > 0) { bossCooldown--; } else { if (player.level >= 2) spawnBoss(); }
        return;
    }
    if (boss.state === 'entering') {
        boss.y += 3; if (boss.y >= 50) { boss.y = 50; boss.state = 'phase1'; }
    } else {
        boss.moveAngle += 0.03; boss.x = (canvas.width/2 - 50) + Math.sin(boss.moveAngle) * 100;
        boss.patternTimer++;
        let cycle = boss.patternTimer % 450; 
        if (cycle < 150) { if (cycle % 4 === 0) fireSpiral(boss, boss.patternTimer * 0.15, 6, '#ff99ff'); }
        else if (cycle < 300) { if (cycle % 30 === 0) fireRing(boss, 18, 4.5, '#ff0000'); }
        else { if (cycle % 20 === 0) fireAimedFan(boss, 5, Math.PI/3, 7.5, '#ffff00'); }
    }
    if (boss.hitTimer > 0) { ctx.fillStyle = "white"; boss.hitTimer--; } else { ctx.fillStyle = boss.color; }
    ctx.beginPath(); ctx.moveTo(boss.x + boss.width/2, boss.y); ctx.lineTo(boss.x + boss.width, boss.y + boss.height/3); ctx.lineTo(boss.x + boss.width, boss.y + boss.height); ctx.lineTo(boss.x, boss.y + boss.height); ctx.lineTo(boss.x, boss.y + boss.height/3); ctx.closePath(); ctx.fill();
    uiBossHpBar.style.width = (boss.hp / boss.maxHp * 100) + "%";
    uiBossHpText.innerText = `BOSS HP: ${Math.floor(boss.hp)}/${boss.maxHp}`;
}

function useBomb() {
    if (gameState !== "playing" || player.hp <= 0) return;
    if (player.bombs > 0) {
        player.bombs--; flashTimer = 20; 
        enemies.forEach(e => { score += 100; spawnExpOrb(e.x, e.y); createParticles(e.x + e.width/2, e.y + e.height/2, 'white'); });
        enemies = []; enemyBullets = []; 
        if (boss) { boss.hp -= 50; boss.hitTimer = 10; createParticles(boss.x+boss.width/2, boss.y+boss.height/2, '#fff'); if(boss.hp <= 0) killBoss(); }
        updateUI();
    }
}
function killBoss() {
    score += 5000; for(let i=0; i<20; i++) spawnExpOrb(boss.x + Math.random()*100, boss.y + Math.random()*100);
    boss = null; uiBossUi.style.display = 'none'; bossCooldown = 1200; bossMaxHp += 50; 
}

function checkCollisions() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i]; let bulletHit = false;
        if (boss) {
            if (rectIntersect(b.x-b.width/2, b.y, b.width, b.height, boss.x, boss.y, boss.width, boss.height)) {
                boss.hp -= b.damage; boss.hitTimer = 3; createParticles(b.x, b.y, 'purple'); 
                applyDianaLifesteal(b.damage);
                bulletHit = true; if (boss.hp <= 0) killBoss();
            }
        }
        if (!bulletHit) {
            for (let j = enemies.length - 1; j >= 0; j--) {
                let e = enemies[j];
                if (rectIntersect(b.x-b.width/2, b.y, b.width, b.height, e.x, e.y, e.width, e.height)) {
                    e.hp -= b.damage; e.hitTimer = 3; createParticles(e.x+e.width/2, e.y+e.height/2, 'red'); 
                    applyDianaLifesteal(b.damage);
                    bulletHit = true; if (e.hp <= 0) killEnemy(e, j); break;
                }
            }
        }
        if(bulletHit) bullets.splice(i, 1);
    }
    for (let i = player.IfritOrbs.length - 1; i >= 0; i--) {
        let k = player.IfritOrbs[i]; let hit = false;
        if (boss && Math.hypot(k.x - (boss.x+boss.width/2), k.y - (boss.y+boss.height/2)) < 60) {
                boss.hp -= k.damage; boss.hitTimer = 3; createParticles(k.x, k.y, '#333');
                applyDianaLifesteal(k.damage);
                hit = true; if (boss.hp <= 0) killBoss();
        }
        if(!hit) {
            for (let j = enemies.length - 1; j >= 0; j--) {
                let e = enemies[j];
                if (Math.hypot(k.x - (e.x+e.width/2), k.y - (e.y+e.height/2)) < 30) {
                    e.hp -= k.damage; e.hitTimer = 3; createParticles(k.x, k.y, '#333'); hit = true; 
                    applyDianaLifesteal(k.damage);
                    if (e.hp <= 0) killEnemy(e, j); break;
                }
            }
        }
        if(hit) player.IfritOrbs.splice(i, 1);
    }
    if (!player.invincible) {
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            let eb = enemyBullets[i];
            if (Math.hypot(eb.x - (player.x+25), eb.y - (player.y+20)) < (20 + (eb.radius||0))) {
                takeDamage(10); enemyBullets.splice(i, 1);
            }
        }
        for (let i = enemies.length - 1; i >= 0; i--) {
            let e = enemies[i];
            if (rectIntersect(player.x, player.y, player.width, player.height, e.x, e.y, e.width, e.height)) {
                takeDamage(10);
            }
        }
        if (boss && rectIntersect(player.x, player.y, player.width, player.height, boss.x, boss.y, boss.width, boss.height)) {
            takeDamage(20);
        }
    }
}

/* js/game.js 내부의 updatePlayerMove 함수를 아래 코드로 교체 */

function updatePlayerMove() {
    // 1. 현재 기체의 이동 속도(moveSpeed) 계산 (아이템 버프/디버프 적용)
    let speedMultiple = 1;
    if (player.leftPart.id === 'haley') speedMultiple += (player.leftPart.level * 0.1);
    else if (player.rightPart.id === 'haley') speedMultiple += (player.rightPart.level * 0.1);
    
    if (player.leftPart.id === 'lethe') speedMultiple -= (player.leftPart.level * 0.1);
    else if (player.rightPart.id === 'lethe') speedMultiple -= (player.rightPart.level * 0.1);
    
    let moveSpeed = player.speed * speedMultiple;

    // 2. 키보드 입력 처리 (PC용)
    let dx = 0;
    let dy = 0;
    if (keys.ArrowUp) dy -= 1;
    if (keys.ArrowDown) dy += 1;
    if (keys.ArrowLeft) dx -= 1;
    if (keys.ArrowRight) dx += 1;

    // 키보드 입력이 있으면 즉시 이동 적용
    if (dx !== 0 || dy !== 0) {
        player.x += dx * moveSpeed;
        player.y += dy * moveSpeed;
        // 키보드 사용 시 터치 버퍼 초기화 (충돌 방지)
        touchBuffer = { x: 0, y: 0 };
    }

    // 3. [핵심 수정] 터치 버퍼 이동 처리
    // 손가락이 움직인 거리(touchBuffer)를 기체 속도(moveSpeed)에 맞춰 따라가게 함
    if (touchBuffer.x !== 0 || touchBuffer.y !== 0) {
        // 남은 거리 계산
        let dist = Math.hypot(touchBuffer.x, touchBuffer.y);

        // 아주 미세한 거리는 무시 (떨림 방지)
        if (dist > 0.5) {
            // 이번 프레임에 이동할 거리: '남은 거리'와 '기체 최대 속도' 중 작은 값 선택
            let step = Math.min(dist, moveSpeed);

            // 이동할 각도 계산
            let angle = Math.atan2(touchBuffer.y, touchBuffer.x);
            
            // 실제 이동량 계산
            let moveX = Math.cos(angle) * step;
            let moveY = Math.sin(angle) * step;

            // 좌표 적용
            player.x += moveX;
            player.y += moveY;

            // 이동한 만큼 버퍼에서 차감
            touchBuffer.x -= moveX;
            touchBuffer.y -= moveY;
        } else {
            // 목표 도달 시 버퍼 완전 초기화
            touchBuffer.x = 0;
            touchBuffer.y = 0;
        }
    }

    // 4. 화면 밖으로 나가지 않게 제한 (Boundary Check)
    if (player.x < 0) player.x = 0;
    if (player.x > canvas.width - player.width) player.x = canvas.width - player.width;
    if (player.y < 0) player.y = 0;
    if (player.y > canvas.height - player.height) player.y = canvas.height - player.height;

    // 5. 무적 시간 감소 처리
    if (player.invincible) { 
        player.invincibleTimer--; 
        if (player.invincibleTimer <= 0) player.invincible = false; 
    }
}

function drawPlayer() {
    let w = player.width, h = player.height, x = player.x, y = player.y;
    if (!player.invincible || frame % 10 >= 5) {
        ctx.fillStyle = PARTS_INFO[player.leftPart.id].color; ctx.beginPath(); ctx.moveTo(x + w/2, y); ctx.lineTo(x, y + h); ctx.lineTo(x + w/2, y + h); ctx.fill();
        ctx.fillStyle = PARTS_INFO[player.rightPart.id].color; ctx.beginPath(); ctx.moveTo(x + w/2, y); ctx.lineTo(x + w/2, y + h); ctx.lineTo(x + w, y + h); ctx.fill();
        ctx.fillStyle = "white"; ctx.font = "10px Arial"; ctx.fillText(`L${player.leftPart.level}`, x, y + h + 10); ctx.fillText(`L${player.rightPart.level}`, x + w - 15, y + h + 10);
    }

    if (player.gabiaState === 'active' && player.gabiaShield > 0) {
        ctx.beginPath();
        ctx.arc(player.x + 25, player.y + 20, 40, 0, Math.PI * 2);
        let opacity = 0.3 + (player.gabiaShield / player.gabiaMaxShield) * 0.7;
        ctx.strokeStyle = `rgba(139, 69, 19, ${opacity})`; 
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = `rgba(139, 69, 19, 0.1)`;
        ctx.fill();
    }
    
    const drawLaser = (laser, partLevel, side) => {
        if (!laser.active) return;

        let partner = (side === 'left') ? player.rightPart : player.leftPart;
        let isBoosted = (partner.id === 'barie');
        let baseW = 15 + (partLevel - 1) * 5;
        let laserW = isBoosted ? baseW * 1.5 : baseW;
        
        let ox;
        if (isBoosted) {
            ox = player.x + 25;
        } else {
            ox = (side === 'left') ? player.x + 10 : player.x + 40;
        }
        let oy = player.y ;

        ctx.save();
        ctx.translate(ox, oy); 
        ctx.rotate(laser.angle + Math.PI / 2); 
        
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.fillRect(-laserW / 2, -1000, laserW, 1000); 
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(-laserW / 4, -1000, laserW / 2, 1000);
        
        ctx.restore();
    };

    drawLaser(player.leftLaser, player.leftPart.level, 'left');
    drawLaser(player.rightLaser, player.rightPart.level, 'right');
}

function updateEnemies() {
    if(boss) return; 
    let spawnRate = Math.max(20, 60 - (player.level * 3)); 
    if (frame >= nextSpawnFrame) { spawnEnemy(); nextSpawnFrame = frame + spawnRate; }
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        if (e.state === 'entering') {
            e.y += 3; if (e.y >= e.destY) { e.y = e.destY; e.state = 'idle'; }
        } else if (e.state === 'idle') {
            e.age++; if (e.age > 400) e.state = 'retreating'; 
        } else if (e.state === 'retreating') {
            e.y -= 4.5; if (e.y < -50) { enemies.splice(i, 1); continue; } 
        }
        if (e.state === 'entering' || e.state === 'idle') {
            let attackProb = 0.02 + (player.level * 0.003); 
            if (Math.random() < attackProb) fireAimedBullet(e);
        }
        if (e.hitTimer > 0) { ctx.fillStyle = "white"; e.hitTimer--; } 
        else { ctx.fillStyle = e.color; }
        ctx.fillRect(e.x, e.y, e.width, e.height);
        ctx.fillStyle = "red"; ctx.fillRect(e.x, e.y - 6, e.width * (e.hp / e.maxHp), 4);
    }
}
function fireAimedBullet(enemy) {
    let ex = enemy.x + enemy.width / 2; let ey = enemy.y + enemy.height / 2; let px = player.x + player.width / 2; let py = player.y + player.height / 2;
    let angle = Math.atan2(py - ey, px - ex); 
    let speed = 6; 
    enemyBullets.push({ x: ex, y: ey, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 5 });
}
function spawnEnemy() {
    let hp = 5; 
    let destY = 50 + Math.random() * 250; 
    enemies.push({ id: 'e_'+frame+Math.random(), x: Math.random() * (canvas.width - 40), y: -50, destY: destY, width: 40, height: 40, hp: hp, maxHp: hp, color: '#ff4444', state: 'entering', age: 0, hitTimer: 0 });
}
function rectIntersect(x1, y1, w1, h1, x2, y2, w2, h2) { return x2 < x1 + w1 && x2 + w2 > x1 && y2 < y1 + h1 && y2 + h2 > y1; }
function killEnemy(enemy, index) { enemies.splice(index, 1); score += 100; spawnExpOrb(enemy.x, enemy.y); }
function spawnExpOrb(x, y) { expOrbs.push({ x: x + 20, y: y + 20, radius: 6, vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10, val: 5 }); }
function updateExpOrbs() {
    for (let i = expOrbs.length - 1; i >= 0; i--) {
        let orb = expOrbs[i]; let px = player.x + 25, py = player.y + 20; let dist = Math.hypot(px - orb.x, py - orb.y);
        orb.y += 1.5; 
        if (orb.x < orb.radius) { orb.x = orb.radius; orb.vx *= -1; }
        if (orb.x > canvas.width - orb.radius) { orb.x = canvas.width - orb.radius; orb.vx *= -1; }
        if (dist < 150) { let angle = Math.atan2(py - orb.y, px - orb.x); orb.x += Math.cos(angle) * 12; orb.y += Math.sin(angle) * 12; } 
        else { orb.x += orb.vx; orb.y += orb.vy; orb.vx *= 0.9; orb.vy *= 0.9; }
        ctx.fillStyle = 'yellow'; ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI*2); ctx.fill();
        if (dist < 30) { gainExp(orb.val); expOrbs.splice(i, 1); continue; }
        if (orb.y > canvas.height + 20) { expOrbs.splice(i, 1); }
    }
}
function gainExp(amount) {
    let bonusMult = 1.0; if (player.leftPart.id === 'pira' && player.rightPart.id !== 'kidian') bonusMult += (player.leftPart.level * 0.2); if (player.rightPart.id === 'pira' && player.leftPart.id !== 'kidian') bonusMult += (player.rightPart.level * 0.2);
    let finalExp = amount * bonusMult; player.currentExp += finalExp;
    if (player.currentExp >= player.maxExp) { player.currentExp -= player.maxExp; player.maxExp += 10; player.level++; showUpgradeModal(); }
    updateUI();
}
function updatePlayerStats() {
    let oldMaxHp = player.maxHp;
    let currentHpRatio = 1.0;
    if (oldMaxHp > 0) {
        currentHpRatio = player.hp / oldMaxHp;
    }
    let hpMultiplier = 1.0;
    if (player.leftPart.id === 'asana') {
        hpMultiplier += (player.leftPart.level * 0.1);
    }
    if (player.leftPart.id === 'suro') {
        hpMultiplier -= (player.leftPart.level * 0.1);
    }
    if (player.rightPart.id === 'asana') {
        hpMultiplier += (player.rightPart.level * 0.1);
    }
    if (player.rightPart.id === 'suro') {
        hpMultiplier -= (player.rightPart.level * 0.1);
    }
    let newMaxHp = Math.floor(100 * hpMultiplier);
    player.maxHp = newMaxHp;
    player.hp = Math.floor(newMaxHp * currentHpRatio);

    let gabiaLevel = 0;
    if (player.leftPart.id === 'gabia') gabiaLevel += player.leftPart.level;
    if (player.rightPart.id === 'gabia') gabiaLevel += player.rightPart.level;
    
    let oldMax = player.gabiaMaxShield;
    player.gabiaMaxShield = gabiaLevel * 20;
    
    if (player.gabiaMaxShield === 0) {
        player.gabiaShield = 0;
        player.gabiaState = 'active';
    } else if (player.gabiaState === 'active' && player.gabiaShield > player.gabiaMaxShield) {
        player.gabiaShield = player.gabiaMaxShield;
    }
    updateUI();
}
function updateUI() {
    let shieldInfo = "";
    if (player.gabiaMaxShield > 0) {
        if (player.gabiaState === 'broken') shieldInfo = " [SHIELD REBOOTING...]";
        else shieldInfo = ` [SHIELD: ${Math.floor(player.gabiaShield)}/${player.gabiaMaxShield}]`;
    }

    uiHpBar.style.width = (player.hp / player.maxHp * 100) + "%"; 
    uiHpText.innerText = `HP: ${Math.floor(player.hp)}/${player.maxHp}` + shieldInfo;
    
    uiXpBar.style.width = (player.currentExp / player.maxExp * 100) + "%"; uiXpText.innerText = `LV.${player.level} (${Math.floor(player.currentExp)}/${player.maxExp})`;
    uiScore.innerText = `Score: ${score}`; uiBombText.innerText = `💣 BOMB: ${player.bombs} (Double Tap)`;
}

function showUpgradeModal() {
    gameState = "paused"; modal.style.display = "flex"; selectUi.style.display = "flex"; replaceUi.style.display = "none";
    upgradeSelectedIndex = 0;
    let keys = Object.keys(PARTS_INFO); keys.sort(() => Math.random() - 0.5); let choices = keys.slice(0, 3);
    currentUpgradeChoices = choices; 
    cardList.innerHTML = "";
    choices.forEach((key, idx) => {
        let info = PARTS_INFO[key]; 
        let div = document.createElement('div'); div.className = 'card';
        let isOwned = (player.leftPart.id === key || player.rightPart.id === key);
        let currentLevel = 0;
        if(player.leftPart.id === key) currentLevel = player.leftPart.level;
        else if(player.rightPart.id === key) currentLevel = player.rightPart.level;
        let isMax = (isOwned && currentLevel >= 5);
        if(isMax) div.classList.add('disabled');
        div.innerHTML = `${isMax ? '<div class="max-badge">MAX</div>' : ''}<div class="card-icon" style="background:${info.color}; border-radius:50%;"></div><div class="card-name" style="color:${info.color}">${info.name}</div><div class="card-desc">${info.desc}</div><div class="card-level">${isOwned ? 'Lv.' + currentLevel + (isMax ? ' (MAX)' : ' -> ' + (currentLevel+1)) : 'New!'}</div>`;
        div.onclick = () => { if(!isMax) selectUpgradePart(key); }; cardList.appendChild(div);
    });
    updateUpgradeVisuals();
}
function selectFixedUpgrade(type) { if (type === 'heal') player.hp = Math.min(player.maxHp, player.hp + 20); else if (type === 'bomb') player.bombs++; updateUI(); finishUpgrade(); }
function selectUpgradePart(partId) {
    if (player.leftPart.id === partId) { if(player.leftPart.level < 5) { player.leftPart.level++; finishUpgrade(); } } 
    else if (player.rightPart.id === partId) { if(player.rightPart.level < 5) { player.rightPart.level++; finishUpgrade(); } } 
    else { 
        selectedNewPartId = partId; 
        selectUi.style.display = "none"; 
        replaceUi.style.display = "flex"; 
        replaceSelection='left'; 
        updateReplaceVisuals(); 
        document.getElementById('btn-replace-left').innerText = `왼쪽: ${PARTS_INFO[player.leftPart.id].name} (Lv.${player.leftPart.level}) 교체`; 
        document.getElementById('btn-replace-right').innerText = `오른쪽: ${PARTS_INFO[player.rightPart.id].name} (Lv.${player.rightPart.level}) 교체`; 
    }
}
document.getElementById('btn-replace-left').onclick = () => replacePart('left'); 
document.getElementById('btn-replace-right').onclick = () => replacePart('right');
document.getElementById('btn-replace-cancel').onclick = () => cancelReplace();

function replacePart(side) { 
    let oldPart = player[side + 'Part']; let newLevel = Math.max(1, oldPart.level); 
    if (oldPart.id === 'Ifrit') player.IfritOrbs = []; if (oldPart.id === 'elena') player.elenaDrones = []; if (oldPart.id === 'barie') player.barieDrones = []; 
    
    if(oldPart.id === 'lethe') {
            if(side === 'left') player.leftLaser = { active: false, timer: 0 };
            else player.rightLaser = { active: false, timer: 0 };
    }

    player[side + 'Part'] = { id: selectedNewPartId, level: newLevel }; 
    if (side === 'left') {
        player.leftCooldown = 0;
    } else {
        player.rightCooldown = 6;
    }

    finishUpgrade(); 
    if (selectedNewPartId === 'gabia') {
        player.gabiaShield = player.gabiaMaxShield;
        player.gabiaState = 'active';
        updateUI(); 
    }
}
function cancelReplace() { replaceUi.style.display = "none"; selectUi.style.display = "flex"; }
function finishUpgrade() { modal.style.display = "none"; gameState = "playing"; updatePlayerStats(); player.invincible = true; player.invincibleTimer = 60; animate(); }
function createParticles(x, y, color) { for(let i=0; i<8; i++) { particles.push({x, y, vx:(Math.random()-0.5)*7, vy:(Math.random()-0.5)*7, life:10, color}); } }
function updateParticles() {
    for(let i=particles.length-1; i>=0; i--) { let p = particles[i]; p.x+=p.vx; p.y+=p.vy; p.life--; ctx.fillStyle=p.color; ctx.globalAlpha=p.life/10; ctx.fillRect(p.x, p.y, 4, 4); ctx.globalAlpha=1; if(p.life<=0) particles.splice(i,1); }
}

function takeDamage(amount) {
    if (player.invincible) return; 

    let dodgeChance = 0;
    if (player.leftPart.id === 'shady') dodgeChance = 0.4 + (player.leftPart.level - 1) * 0.1;
    else if (player.rightPart.id === 'shady') dodgeChance = 0.4 + (player.rightPart.level - 1) * 0.1;
    
    if (Math.random() < dodgeChance) {
        createParticles(player.x + 25, player.y + 20, 'cyan');
        console.log("DODGE!");
        player.invincible = true; player.invincibleTimer = 180;
        return;
    }

    if (player.gabiaState === 'active' && player.gabiaShield > 0) {
        player.gabiaShield -= amount;
        player.gabiaHitTimer = 180; 
        createParticles(player.x + 25, player.y + 20, '#8B4513'); 

        if (player.gabiaShield <= 0) {
            player.gabiaShield = 0;
            player.gabiaState = 'broken'; 
            
            player.invincible = true; 
            player.invincibleTimer = 180;
            createParticles(player.x+25, player.y+20, 'white'); 
            console.log("Shield Broken! Rebooting in 20s...");
        } 
        updateUI();
        return; 
    }

    player.hp -= amount; 
    player.totalHitCount++;
    updateUI();
    if (player.hp > 0) {

        player.invincible = true; player.invincibleTimer = 180;
        createParticles(player.x+25, player.y+20, 'white');
    }
}

function updateGabiaShield() {
    if (player.gabiaMaxShield <= 0) return;

    if (player.gabiaState === 'broken') {
        let regenRate = player.gabiaMaxShield / 1800; 
        player.gabiaShield += regenRate;

        if (player.gabiaShield >= player.gabiaMaxShield) {
            player.gabiaShield = player.gabiaMaxShield;
            player.gabiaState = 'active';
            createParticles(player.x + 25, player.y + 20, '#8B4513'); 
            updateUI();
        }
    } else {
        if (player.gabiaHitTimer > 0) {
            player.gabiaHitTimer--;
        } else {
            if (player.gabiaShield < player.gabiaMaxShield) {
                let regenRate = player.gabiaMaxShield / 600;
                player.gabiaShield += regenRate;
                if (player.gabiaShield > player.gabiaMaxShield) player.gabiaShield = player.gabiaMaxShield;
            }
        }
    }
    if (frame % 10 === 0) updateUI();
}
function applyDianaLifesteal(damage) {
    if (player.leftPart.id === 'diana' || player.rightPart.id === 'diana') {
        let healAmount = damage * 0.05; 
        if (healAmount > 0) {
            player.hp = Math.min(player.maxHp, player.hp + healAmount);
            updateUI(); 
        }
    }
}

function getSilphirMultiplier() {
    let silphirLevel = 0;
    if (player.leftPart.id === 'silphir') silphirLevel = Math.max(silphirLevel, player.leftPart.level);
    if (player.rightPart.id === 'silphir') silphirLevel = Math.max(silphirLevel, player.rightPart.level);

    if (player.leftPart.id === 'barie' && player.rightPart.id === 'silphir') silphirLevel = Math.max(silphirLevel, player.leftPart.level);
    if (player.rightPart.id === 'barie' && player.leftPart.id === 'silphir') silphirLevel = Math.max(silphirLevel, player.rightPart.level);

    if (silphirLevel === 0) return 1.0;

    let maxFrames = 18000;
    let progress = Math.min(1.0, player.silphirTimer / maxFrames);

    let startMult = 1.0 + (silphirLevel - 1) * 0.125; 
    let endMult = 1.5 + (silphirLevel - 1) * 0.25;    

    return startMult + (endMult - startMult) * progress;
}
function updateNerOrbs() {
    let ameliaLevel = 0;
    if (player.leftPart.id === 'amelia') ameliaLevel += player.leftPart.level;
    if (player.rightPart.id === 'amelia') ameliaLevel += player.rightPart.level;
    let homingStrength = ameliaLevel * 0.005; 

    for (let i = player.nerOrbs.length - 1; i >= 0; i--) {
        let orb = player.nerOrbs[i];

        if (homingStrength > 0 && !orb.isEnemy) {
            let closest = null;
            let minDist = Infinity;
            
            if (boss) {
                closest = boss;
            } else if (enemies.length > 0) {
                enemies.forEach(e => {
                    let d = Math.hypot((e.x+e.width/2)-orb.x, (e.y+e.height/2)-orb.y);
                    if(d < minDist) { minDist = d; closest = e; }
                });
            }

            if (closest) {
                let tx = closest.x + closest.width/2;
                let ty = closest.y + closest.height/2;
                let angle = Math.atan2(ty - orb.y, tx - orb.x);
                
                let speed = Math.hypot(orb.vx, orb.vy);
                let targetVx = Math.cos(angle) * speed;
                let targetVy = Math.sin(angle) * speed;
                
                orb.vx += (targetVx - orb.vx) * homingStrength;
                orb.vy += (targetVy - orb.vy) * homingStrength;
            }
        }
        
        orb.x += orb.vx;
        orb.y += orb.vy;
        orb.timer++;

        let triggerExplosion = false;

        if (orb.timer >= orb.explodeTime) {
            triggerExplosion = true;
        }

        if (!triggerExplosion) {
            if (boss && rectIntersect(orb.x - 10, orb.y - 10, 20, 20, boss.x, boss.y, boss.width, boss.height)) {
                triggerExplosion = true;
            }
            if (!triggerExplosion) {
                for (let e of enemies) {
                    if (rectIntersect(orb.x - 10, orb.y - 10, 20, 20, e.x, e.y, e.width, e.height)) {
                        triggerExplosion = true;
                        break; 
                    }
                }
            }
        }

        if (triggerExplosion) {
            createParticles(orb.x, orb.y, orb.isEnemy ? 'red' : 'orange');

            let bulletCount = 12 + (orb.level - 1) * 3;
            let angleStep = (Math.PI * 2) / bulletCount;

            for (let j = 0; j < bulletCount; j++) {
                let angle = angleStep * j;
                
                let bx = orb.x;
                let by = orb.y;
                let speed = 6;
                let bvx = Math.cos(angle) * speed;
                let bvy = Math.sin(angle) * speed;

                if (orb.isEnemy) {
                    enemyBullets.push({ x: bx, y: by, vx: bvx, vy: bvy, radius: 4, color: 'red' });
                } else {
                    spawnBullet(bx, by, bvx, bvy, 4, 4, 'yellow', 2, 'circle');
                }
            }

            player.nerOrbs.splice(i, 1);
            continue; 
        }

        if (orb.y < -50 || orb.y > canvas.height + 50) {
            player.nerOrbs.splice(i, 1);
            continue;
        }

        ctx.beginPath();
        ctx.arc(orb.x, orb.y, 10, 0, Math.PI * 2); 
        ctx.fillStyle = orb.isEnemy ? '#8B0000' : '#FF8C00'; 
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function drawGameOver() { ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = "white"; ctx.textAlign="center"; ctx.font="40px Arial"; ctx.fillText("GAME OVER", canvas.width/2, canvas.height/2); }
initGame(); animate();