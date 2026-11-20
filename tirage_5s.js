(function () {
      const STORAGE_KEY_STATIONS = 'tirage_5s_grosse_commande_stations_v1';
      const STORAGE_KEY_HISTORY = 'tirage_5s_grosse_commande_history_v1';
      const STORAGE_KEY_SOUND = 'tirage_5s_grosse_commande_sound_v1';

      const DEFAULT_STATIONS = [
        { id: 'poste-1', name: 'Poste 1', operator: '', active: true },
        { id: 'poste-2', name: 'Poste 2', operator: '', active: true },
        { id: 'poste-3', name: 'Poste 3', operator: '', active: true },
        { id: 'poste-4', name: 'Poste 4', operator: '', active: true },
        { id: 'poste-5', name: 'Poste 5', operator: '', active: true },
        { id: 'poste-6', name: 'Poste 6', operator: '', active: true },
        { id: 'poste-7', name: 'Poste 7', operator: '', active: true },
        { id: 'poste-8', name: 'Poste 8', operator: '', active: true }
      ];

      let memoryStorage = {};
      function readStorage(key) {
        try {
          if (window.localStorage) {
            const val = window.localStorage.getItem(key);
            if (val !== null) return val;
          }
        } catch (e) {}
        return memoryStorage[key] || null;
      }

      function writeStorage(key, value) {
        memoryStorage[key] = value;
        try {
          if (window.localStorage) {
            window.localStorage.setItem(key, value);
          }
        } catch (e) {}
      }

      function loadStations() {
        try {
          const raw = readStorage(STORAGE_KEY_STATIONS);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              return parsed.map((item, idx) => ({
                id: String(item.id || ('poste-' + (idx + 1) + '-' + Date.now())),
                name: String(item.name || ('Poste ' + (idx + 1))).trim() || ('Poste ' + (idx + 1)),
                operator: String(item.operator || '').trim(),
                active: Boolean(item.active)
              }));
            }
          }
        } catch (e) {}
        return DEFAULT_STATIONS.map(s => ({ ...s }));
      }

      function loadHistory() {
        try {
          const raw = readStorage(STORAGE_KEY_HISTORY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
          }
        } catch (e) {}
        return [];
      }

      let stations = loadStations();
      let history = loadHistory();
      let soundEnabled = readStorage(STORAGE_KEY_SOUND) !== 'false';
      let isSpinning = false;
      let rouletteTimer = null;
      let currentRouletteId = null;
      let currentWinnerId = null;
      let editingStationId = null;
      let resetConfirmTimer = null;
      let clearHistoryConfirmTimer = null;

      const stationsGrid = document.getElementById('stations-grid');
      const historyList = document.getElementById('history-list');
      const activeCountBadge = document.getElementById('active-count-badge');
      const historyCountBadge = document.getElementById('history-count-badge');
      const totalStationsLabel = document.getElementById('total-stations-label');
      const btnLaunch = document.getElementById('btn-launch');
      const stageKicker = document.getElementById('stage-kicker');
      const stageHeadline = document.getElementById('stage-headline');
      const stageSubtext = document.getElementById('stage-subtext');
      const inlineBanner = document.getElementById('inline-banner');
      const inlineBannerText = document.getElementById('inline-banner-text');
      const addForm = document.getElementById('add-station-form');
      const newStationInput = document.getElementById('new-station-input');
      const btnCheckAll = document.getElementById('btn-check-all');
      const btnUncheckAll = document.getElementById('btn-uncheck-all');
      const btnResetDefault = document.getElementById('btn-reset-default');
      const btnClearHistory = document.getElementById('btn-clear-history');
      const btnToggleSound = document.getElementById('btn-toggle-sound');
      const soundIcon = document.getElementById('sound-icon');
      const soundLabel = document.getElementById('sound-label');
      const editModal = document.getElementById('edit-modal');
      const editForm = document.getElementById('edit-station-form');
      const editNameInput = document.getElementById('edit-name-input');
      const editOperatorInput = document.getElementById('edit-operator-input');
      const btnCloseModal = document.getElementById('btn-close-modal');
      const btnCancelModal = document.getElementById('btn-cancel-modal');
      const confettiCanvas = document.getElementById('confetti-canvas');
      const confettiCtx = confettiCanvas.getContext('2d');

      let audioCtx = null;
      function getAudioContext() {
        if (!soundEnabled) return null;
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (!AudioContextClass) return null;
          if (!audioCtx) audioCtx = new AudioContextClass();
          if (audioCtx.state === 'suspended') audioCtx.resume();
          return audioCtx;
        } catch (e) {
          return null;
        }
      }

      function playTickSound(pitchFactor = 1) {
        const ctx = getAudioContext();
        if (!ctx) return;
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(520 * pitchFactor, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(220 * pitchFactor, ctx.currentTime + 0.045);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.05);
        } catch (e) {}
      }

      function playWinFanfare() {
        const ctx = getAudioContext();
        if (!ctx) return;
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const startTime = ctx.currentTime + idx * 0.09;
            const duration = idx === notes.length - 1 ? 0.42 : 0.14;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0.12, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration + 0.02);
          } catch (e) {}
        });
      }

      let confettiParticles = [];
      let confettiAnimId = null;

      function resizeConfettiCanvas() {
        confettiCanvas.width = window.innerWidth;
        confettiCanvas.height = window.innerHeight;
      }

      function launchConfetti() {
        resizeConfettiCanvas();
        const colors = ['#fbbf24', '#10b981', '#38bdf8', '#f472b6', '#a78bfa', '#ffffff'];
        confettiParticles = [];
        for (let i = 0; i < 130; i++) {
          confettiParticles.push({
            x: Math.random() * confettiCanvas.width,
            y: -20 - Math.random() * confettiCanvas.height * 0.4,
            w: 7 + Math.random() * 8,
            h: 5 + Math.random() * 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 5,
            vy: 2.5 + Math.random() * 4.5,
            rot: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.2,
            alpha: 1
          });
        }
        if (confettiAnimId) cancelAnimationFrame(confettiAnimId);

        function renderConfetti() {
          confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
          let alive = false;
          for (const p of confettiParticles) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.06;
            p.rot += p.vRot;
            if (p.y > confettiCanvas.height - 60) p.alpha -= 0.025;
            if (p.alpha > 0 && p.y < confettiCanvas.height + 30) {
              alive = true;
              confettiCtx.save();
              confettiCtx.globalAlpha = Math.max(0, p.alpha);
              confettiCtx.translate(p.x, p.y);
              confettiCtx.rotate(p.rot);
              confettiCtx.fillStyle = p.color;
              confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
              confettiCtx.restore();
            }
          }
          if (alive) {
            confettiAnimId = requestAnimationFrame(renderConfetti);
          } else {
            confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
          }
        }
        confettiAnimId = requestAnimationFrame(renderConfetti);
      }

      window.addEventListener('resize', resizeConfettiCanvas);

      function saveAll() {
        writeStorage(STORAGE_KEY_STATIONS, JSON.stringify(stations));
        writeStorage(STORAGE_KEY_HISTORY, JSON.stringify(history));
      }

      function getActiveStations() {
        return stations.filter(s => s.active);
      }

      function escapeHtml(str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function updateSoundUI() {
        soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
        soundLabel.textContent = soundEnabled ? 'Son ON' : 'Son OFF';
        writeStorage(STORAGE_KEY_SOUND, String(soundEnabled));
      }

      function updateHeaderAndControls() {
        const activeCount = getActiveStations().length;
        const totalCount = stations.length;
        activeCountBadge.textContent = activeCount + ' / ' + totalCount + ' postes actifs';
        totalStationsLabel.textContent = totalCount + (totalCount > 1 ? ' postes configurés' : ' poste configuré');
        btnLaunch.disabled = isSpinning || activeCount === 0;

        if (activeCount === 0 && !isSpinning) {
          inlineBannerText.textContent = '⚠️ Aucun poste coché ! Cochez au moins 1 poste pour lancer le tirage.';
          inlineBanner.classList.add('visible');
        } else if (!isSpinning) {
          inlineBanner.classList.remove('visible');
        }
      }

      function renderStations() {
        stationsGrid.innerHTML = '';

        stations.forEach((station, idx) => {
          const card = document.createElement('div');
          card.className = 'station-card ' + (station.active ? 'is-active' : 'is-inactive');
          if (station.id === currentRouletteId) card.classList.add('is-roulette');
          if (station.id === currentWinnerId) card.classList.add('is-winner');

          const statusText = station.id === currentWinnerId
            ? '🏆 Désigné'
            : (station.active ? 'Actif' : 'Exclu');

          const opHtml = station.operator
            ? '<div class="station-operator has-op">👤 ' + escapeHtml(station.operator) + '</div>'
            : '<div class="station-operator">Aucun référent assigné</div>';

          card.innerHTML =
            '<div class="card-top">' +
              '<label class="checkbox-label">' +
                '<input type="checkbox" class="native-checkbox" ' + (station.active ? 'checked' : '') + ' ' + (isSpinning ? 'disabled' : '') + ' />' +
                '<span class="status-pill">' + statusText + '</span>' +
              '</label>' +
              '<div class="card-actions">' +
                '<button type="button" class="icon-btn btn-edit" title="Renommer / Référent">✎</button>' +
                '<button type="button" class="icon-btn btn-del" title="Supprimer le poste">🗑</button>' +
              '</div>' +
            '</div>' +
            '<div class="card-body">' +
              '<div class="card-title-row">' +
                '<span class="station-name">' + escapeHtml(station.name) + '</span>' +
                '<span class="station-index">#' + String(idx + 1).padStart(2, '0') + '</span>' +
              '</div>' +
              opHtml +
            '</div>';

          const checkbox = card.querySelector('.native-checkbox');
          const btnEdit = card.querySelector('.btn-edit');
          const btnDel = card.querySelector('.btn-del');

          checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            if (isSpinning) return;
            station.active = checkbox.checked;
            if (!station.active && currentWinnerId === station.id) {
              currentWinnerId = null;
            }
            saveAll();
            renderStations();
            updateHeaderAndControls();
          });

          card.addEventListener('click', (e) => {
            if (isSpinning) return;
            if (e.target.closest('.card-actions') || e.target.classList.contains('native-checkbox') || e.target.tagName === 'LABEL') return;
            station.active = !station.active;
            if (!station.active && currentWinnerId === station.id) {
              currentWinnerId = null;
            }
            saveAll();
            renderStations();
            updateHeaderAndControls();
          });

          btnEdit.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isSpinning) return;
            openEditModal(station.id);
          });

          btnDel.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isSpinning) return;
            deleteStation(station.id);
          });

          stationsGrid.appendChild(card);
        });
      }

      function renderHistory() {
        historyCountBadge.textContent = String(history.length);
        if (!history.length) {
          historyList.innerHTML =
            '<div class="empty-history">' +
              'Aucun tirage effectué pour le moment.<br>' +
              'Cliquez sur <strong>Lancer le tirage</strong> pour démarrer.' +
            '</div>';
          return;
        }

        historyList.innerHTML = history.map((entry, index) => {
          const opBadge = entry.operator
            ? '<span class="history-op-tag">' + escapeHtml(entry.operator) + '</span>'
            : '';
          return (
            '<div class="history-item ' + (index === 0 ? 'latest' : '') + '">' +
              '<div class="history-item-top">' +
                '<span class="history-station">' + (index === 0 ? '🏆 ' : '') + escapeHtml(entry.stationName) + '</span>' +
                '<span class="history-ratio">' + escapeHtml(entry.ratio) + '</span>' +
              '</div>' +
              '<div class="history-date">' +
                '<span>' + escapeHtml(entry.dateLabel) + '</span>' +
                opBadge +
              '</div>' +
            '</div>'
          );
        }).join('');
      }

      function addStation(name) {
        const cleanName = String(name || '').trim();
        if (!cleanName) return;
        stations.push({
          id: 'poste-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          name: cleanName,
          operator: '',
          active: true
        });
        saveAll();
        renderStations();
        updateHeaderAndControls();
      }

      function deleteStation(id) {
        stations = stations.filter(s => s.id !== id);
        if (currentWinnerId === id) currentWinnerId = null;
        if (currentRouletteId === id) currentRouletteId = null;
        saveAll();
        renderStations();
        updateHeaderAndControls();
      }

      function setAllActive(state) {
        if (isSpinning) return;
        stations = stations.map(s => ({ ...s, active: state }));
        if (!state) currentWinnerId = null;
        saveAll();
        renderStations();
        updateHeaderAndControls();
      }

      function resetToDefaultStations() {
        if (isSpinning) return;
        stations = DEFAULT_STATIONS.map(s => ({ ...s }));
        currentWinnerId = null;
        currentRouletteId = null;
        saveAll();
        renderStations();
        updateHeaderAndControls();
        stageKicker.textContent = '🎲 Prêt pour le tirage';
        stageHeadline.textContent = 'En attente du lancement';
        stageSubtext.textContent = '8 postes par défaut restaurés. Seuls les postes cochés participent.';
      }

      function clearHistory() {
        if (isSpinning) return;
        history = [];
        saveAll();
        renderHistory();
      }

      function openEditModal(id) {
        const station = stations.find(s => s.id === id);
        if (!station) return;
        editingStationId = id;
        editNameInput.value = station.name;
        editOperatorInput.value = station.operator || '';
        editModal.classList.add('open');
        setTimeout(() => editNameInput.focus(), 40);
      }

      function closeEditModal() {
        editModal.classList.remove('open');
        editingStationId = null;
      }

      function startRoulette() {
        if (isSpinning) return;
        const pool = getActiveStations();
        if (!pool.length) {
          inlineBannerText.textContent = '⚠️ Aucun poste coché ! Cochez au moins 1 poste avant de lancer le tirage.';
          inlineBanner.classList.add('visible');
          playTickSound(0.6);
          return;
        }

        inlineBanner.classList.remove('visible');
        isSpinning = true;
        currentWinnerId = null;
        updateHeaderAndControls();

        const winner = pool[Math.floor(Math.random() * pool.length)];
        const totalSteps = pool.length === 1 ? 8 : Math.max(18, pool.length * 3);
        let step = 0;

        stageKicker.textContent = '⚡ Tirage en cours';
        stageSubtext.textContent = 'Sélection aléatoire parmi ' + pool.length + ' poste(s) actif(s)...';

        function tick() {
          step++;
          const isLastStep = step >= totalSteps;
          const candidate = isLastStep ? winner : pool[Math.floor(Math.random() * pool.length)];
          currentRouletteId = candidate.id;
          stageHeadline.textContent = candidate.name;
          renderStations();

          if (!isLastStep) {
            playTickSound(0.85 + (step / totalSteps) * 0.45);
            const progress = step / totalSteps;
            const delay = Math.round(55 + Math.pow(progress, 2.4) * 290);
            rouletteTimer = setTimeout(tick, delay);
          } else {
            finishRoulette(winner, pool.length);
          }
        }

        tick();
      }

      function finishRoulette(winner, poolSize) {
        clearTimeout(rouletteTimer);
        currentRouletteId = null;
        currentWinnerId = winner.id;
        isSpinning = false;

        stageKicker.textContent = '🏆 Les jeux sont faits !';
        stageHeadline.innerHTML =
          '<span>' + escapeHtml(winner.name) + '</span>' +
          (winner.operator ? '<span class="badge-rituel">👤 ' + escapeHtml(winner.operator) + '</span>' : '');
        stageSubtext.textContent = 'Poste 5S désigné sur ' + poolSize + ' poste(s) actif(s).';

        const now = new Date();
        const dateLabel = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) +
          ' à ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        history.unshift({
          id: 'draw-' + Date.now(),
          stationName: winner.name,
          operator: winner.operator || '',
          ratio: '1/' + poolSize,
          dateLabel
        });
        if (history.length > 40) history = history.slice(0, 40);

        saveAll();
        renderStations();
        renderHistory();
        updateHeaderAndControls();
        playWinFanfare();
        launchConfetti();
      }

      addForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (isSpinning) return;
        const val = newStationInput.value.trim();
        if (!val) {
          newStationInput.focus();
          return;
        }
        addStation(val);
        newStationInput.value = '';
        newStationInput.focus();
      });

      if (btnClearHistory) {
        btnClearHistory.addEventListener('click', () => {
          if (isSpinning || !history.length) return;
          if (!btnClearHistory.classList.contains('confirming')) {
            btnClearHistory.classList.add('confirming');
            btnClearHistory.style.background = '#dc2626';
            btnClearHistory.style.borderColor = '#ef4444';
            btnClearHistory.style.color = '#ffffff';
            btnClearHistory.textContent = 'Confirmer ?';
            clearTimeout(clearHistoryConfirmTimer);
            clearHistoryConfirmTimer = setTimeout(() => {
              btnClearHistory.classList.remove('confirming');
              btnClearHistory.style.background = '';
              btnClearHistory.style.borderColor = '';
              btnClearHistory.style.color = '';
              btnClearHistory.textContent = 'Vider';
            }, 3500);
          } else {
            clearTimeout(clearHistoryConfirmTimer);
            btnClearHistory.classList.remove('confirming');
            btnClearHistory.style.background = '';
            btnClearHistory.style.borderColor = '';
            btnClearHistory.style.color = '';
            btnClearHistory.textContent = 'Vider';
            clearHistory();
          }
        });
      }

      btnCheckAll.addEventListener('click', () => setAllActive(true));
      btnUncheckAll.addEventListener('click', () => setAllActive(false));

      btnResetDefault.addEventListener('click', () => {
        if (isSpinning) return;
        if (!btnResetDefault.classList.contains('confirming')) {
          btnResetDefault.classList.add('confirming');
          btnResetDefault.textContent = 'Confirmer (8 postes) ?';
          clearTimeout(resetConfirmTimer);
          resetConfirmTimer = setTimeout(() => {
            btnResetDefault.classList.remove('confirming');
            btnResetDefault.textContent = '↺ Réinitialiser (8 postes)';
          }, 3500);
        } else {
          clearTimeout(resetConfirmTimer);
          btnResetDefault.classList.remove('confirming');
          btnResetDefault.textContent = '↺ Réinitialiser (8 postes)';
          resetToDefaultStations();
        }
      });

      btnToggleSound.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        updateSoundUI();
        if (soundEnabled) playTickSound(1.1);
      });

      btnLaunch.addEventListener('click', startRoulette);

      btnCloseModal.addEventListener('click', closeEditModal);
      btnCancelModal.addEventListener('click', closeEditModal);
      editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
      });

      editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!editingStationId) return;
        const station = stations.find(s => s.id === editingStationId);
        if (station) {
          const newName = editNameInput.value.trim();
          if (newName) station.name = newName;
          station.operator = editOperatorInput.value.trim();
          saveAll();
          renderStations();
        }
        closeEditModal();
      });

      document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !editModal.classList.contains('open')) {
          const tag = document.activeElement && document.activeElement.tagName;
          if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'BUTTON') {
            e.preventDefault();
            startRoulette();
          }
        } else if (e.key === 'Escape' && editModal.classList.contains('open')) {
          closeEditModal();
        }
      });

      updateSoundUI();
      renderStations();
      renderHistory();
      updateHeaderAndControls();
    })();
