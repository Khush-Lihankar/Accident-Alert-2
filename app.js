/**
 * MADS - Mobile Accident Detection System
 * Uses Telegram Bot for automatic alerts
 */

class MADS {
    constructor() {
        this.isActive = false;
        this.isDetecting = false;
        this.accelerationHistory = [];
        this.maxHistoryLength = 10;
        this.threshold = 3.5;
        this.countdownTime = 10;
        this.countdownInterval = null;
        this.location = null;
        this.contacts = [];
        this.settings = {
            enableSound: true,
            enableVibration: true,
            notificationMethod: 'telegram'
        };
        
        // Telegram Bot configuration
        this.telegram = {
            botToken: localStorage.getItem('mads_telegram_token') || '',
            chatIds: JSON.parse(localStorage.getItem('mads_telegram_chats') || '[]'),
            isConfigured: false
        };
        
        this.init();
    }
    
    async init() {
        this.setupPWA();
        this.loadData();
        this.setupEventListeners();
        await this.requestPermissions();
        this.checkTelegramConfig();
        this.updateUI();
        console.log('MADS initialized - Mobile Accident Detection System');
    }
    
    checkTelegramConfig() {
        this.telegram.isConfigured = !!(this.telegram.botToken && this.telegram.chatIds.length > 0);
        
        const telegramStatus = document.getElementById('telegram-status');
        if (telegramStatus) {
            if (this.telegram.isConfigured) {
                telegramStatus.innerHTML = '<i class="fab fa-telegram" style="color: #0088cc;"></i> Telegram: Ready';
                telegramStatus.style.color = '#0088cc';
                
                // Remove setup button if exists
                const setupBtn = document.getElementById('telegram-setup-btn');
                if (setupBtn) setupBtn.remove();
            } else {
                telegramStatus.innerHTML = '<i class="fab fa-telegram"></i> Telegram: Setup needed';
                telegramStatus.style.color = 'var(--warning)';
                this.showTelegramSetupPrompt();
            }
        }
    }
    
    showTelegramSetupPrompt() {
        // Remove existing button if any
        const existingBtn = document.getElementById('telegram-setup-btn');
        if (existingBtn) existingBtn.remove();
        
        const setupBtn = document.createElement('button');
        setupBtn.id = 'telegram-setup-btn';
        setupBtn.className = 'btn btn-secondary';
        setupBtn.innerHTML = '<i class="fab fa-telegram"></i> Setup Telegram Bot (Free & Automatic)';
        setupBtn.onclick = () => this.showTelegramSetupModal();
        
        // Add after contacts card
        const contactsCard = document.querySelector('.card:has(.contacts-list)');
        if (contactsCard) {
            contactsCard.parentNode.insertBefore(setupBtn, contactsCard.nextSibling);
        }
    }
    
    showTelegramSetupModal() {
        // Remove any existing modal
        const existingModal = document.getElementById('telegram-setup-modal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.className = 'overlay';
        modal.id = 'telegram-setup-modal';
        modal.style.display = 'flex';
        
        modal.innerHTML = `
            <div class="modal telegram-setup-modal">
                <div class="modal-header">
                    <i class="fab fa-telegram" style="color: #0088cc; font-size: 3rem;"></i>
                    <h2>Setup Telegram Bot Alerts</h2>
                    <p class="subtitle">MADS - Mobile Accident Detection System</p>
                </div>
                
                <div class="setup-steps">
                    <div class="step">
                        <div class="step-number">1</div>
                        <div class="step-content">
                            <h4>Create a Telegram Bot</h4>
                            <p>Open Telegram and search for <strong>@BotFather</strong></p>
                            <div class="info-box">
                                <code>@BotFather</code>
                                <button class="copy-btn" onclick="window.open('https://t.me/botfather')">
                                    <i class="fab fa-telegram"></i> Open BotFather
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-number">2</div>
                        <div class="step-content">
                            <h4>Create New Bot</h4>
                            <p>Send this command to BotFather:</p>
                            <div class="info-box">
                                <code>/newbot</code>
                                <button class="copy-btn" onclick="navigator.clipboard.writeText('/newbot'); this.innerHTML='<i class=\\'fas fa-check\\'></i> Copied!'; setTimeout(() => this.innerHTML='<i class=\\'fas fa-copy\\'></i> Copy', 2000)">
                                    <i class="fas fa-copy"></i> Copy
                                </button>
                            </div>
                            <p class="small">Then follow the instructions:</p>
                            <ul class="instruction-list">
                                <li>Choose a name for your bot (e.g., MADS Alert)</li>
                                <li>Choose a username (must end in 'bot', e.g., mads_alert_bot)</li>
                            </ul>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-number">3</div>
                        <div class="step-content">
                            <h4>Get Your Bot Token</h4>
                            <p>After creating the bot, BotFather will give you a token like:</p>
                            <div class="info-box token-example">
                                <code>1234567890:ABCdefGHIjklMNOpqrsTUVwxyz</code>
                            </div>
                            <p class="small">This is your bot token - keep it secret!</p>
                            
                            <div class="input-group">
                                <label for="telegram-token">Paste Your Bot Token Here</label>
                                <input type="text" id="telegram-token" placeholder="e.g., 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz" value="${this.telegram.botToken}">
                            </div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-number">4</div>
                        <div class="step-content">
                            <h4>Get Your Chat ID</h4>
                            <p>Start a chat with your bot and send any message, then click:</p>
                            <button class="btn btn-primary" onclick="mads.getTelegramChatId()">
                                <i class="fas fa-sync"></i> Get My Chat ID
                            </button>
                            <div id="chat-id-result" style="margin-top: 10px;"></div>
                            
                            <div class="input-group" id="chat-id-input-group" style="display: none;">
                                <label for="telegram-chatid">Your Chat ID</label>
                                <input type="text" id="telegram-chatid" placeholder="e.g., 123456789">
                                <button class="btn btn-secondary" onclick="mads.addChatId()">
                                    <i class="fas fa-plus"></i> Add Chat ID
                                </button>
                            </div>
                            
                            <div id="saved-chats" class="saved-chats">
                                ${this.renderSavedChats()}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="test-section">
                    <button class="btn btn-test" onclick="mads.testTelegram()">
                        <i class="fas fa-vial"></i> Test Telegram Connection
                    </button>
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="document.getElementById('telegram-setup-modal').remove()">
                        Close
                    </button>
                    <button class="btn btn-primary" onclick="mads.saveTelegramConfig()">
                        <i class="fas fa-save"></i> Save Configuration
                    </button>
                </div>
                
                <div class="note">
                    <small><i class="fas fa-info-circle"></i> Once configured, alerts will be sent automatically via Telegram to all added chat IDs</small>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    renderSavedChats() {
        if (this.telegram.chatIds.length === 0) {
            return '<p class="small">No chat IDs saved yet</p>';
        }
        
        return `
            <p><strong>Saved Chat IDs:</strong></p>
            ${this.telegram.chatIds.map((chatId, index) => `
                <div class="chat-id-item">
                    <code>${chatId}</code>
                    <button class="delete-chat" onclick="mads.removeChatId(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('')}
        `;
    }
    
    async getTelegramChatId() {
        if (!this.telegram.botToken) {
            document.getElementById('chat-id-result').innerHTML = `
                <div class="warning-message">
                    Please enter your bot token first
                </div>
            `;
            return;
        }
        
        try {
            const response = await fetch(`https://api.telegram.org/bot${this.telegram.botToken}/getUpdates`);
            const data = await response.json();
            
            if (data.ok && data.result.length > 0) {
                const chatId = data.result[0].message.chat.id;
                document.getElementById('chat-id-result').innerHTML = `
                    <div class="success-message">
                        Found your chat ID: <strong>${chatId}</strong>
                    </div>
                `;
                
                // Show the input with this ID
                document.getElementById('chat-id-input-group').style.display = 'block';
                document.getElementById('telegram-chatid').value = chatId;
            } else {
                document.getElementById('chat-id-result').innerHTML = `
                    <div class="warning-message">
                        No messages found. Please send a message to your bot first, then try again.
                        <br><br>
                        <button class="btn btn-primary" onclick="window.open('https://t.me/${this.getBotUsername()}')">
                            <i class="fab fa-telegram"></i> Open Your Bot
                        </button>
                    </div>
                `;
            }
        } catch (error) {
            document.getElementById('chat-id-result').innerHTML = `
                <div class="error-message">
                    Error: ${error.message}. Check your bot token.
                </div>
            `;
        }
    }
    
    getBotUsername() {
        // Extract username from token (optional)
        return 'your_bot'; // User will need to know their bot username
    }
    
    addChatId() {
        const chatId = document.getElementById('telegram-chatid')?.value.trim();
        
        if (!chatId) {
            this.showToast('Please enter a chat ID', 'warning');
            return;
        }
        
        if (!this.telegram.chatIds.includes(chatId)) {
            this.telegram.chatIds.push(chatId);
            this.saveTelegramConfig();
            
            // Update the saved chats display
            const savedChatsDiv = document.getElementById('saved-chats');
            if (savedChatsDiv) {
                savedChatsDiv.innerHTML = this.renderSavedChats();
            }
            
            document.getElementById('telegram-chatid').value = '';
            this.showToast('Chat ID added successfully', 'success');
        } else {
            this.showToast('Chat ID already exists', 'warning');
        }
    }
    
    removeChatId(index) {
        this.telegram.chatIds.splice(index, 1);
        this.saveTelegramConfig();
        
        // Update the saved chats display
        const savedChatsDiv = document.getElementById('saved-chats');
        if (savedChatsDiv) {
            savedChatsDiv.innerHTML = this.renderSavedChats();
        }
        
        this.showToast('Chat ID removed', 'success');
    }
    
    saveTelegramConfig() {
        const token = document.getElementById('telegram-token')?.value.trim();
        
        if (token) {
            this.telegram.botToken = token;
        }
        
        localStorage.setItem('mads_telegram_token', this.telegram.botToken);
        localStorage.setItem('mads_telegram_chats', JSON.stringify(this.telegram.chatIds));
        
        this.telegram.isConfigured = !!(this.telegram.botToken && this.telegram.chatIds.length > 0);
        
        // Remove modal if open
        document.getElementById('telegram-setup-modal')?.remove();
        
        // Update UI
        this.checkTelegramConfig();
        this.showToast('Telegram configuration saved!', 'success');
        
        // Send test message
        if (this.telegram.isConfigured) {
            setTimeout(() => this.sendTelegramMessage('System', '✅ MADS Telegram bot configured successfully!'), 1000);
        }
    }
    
    async testTelegram() {
        if (!this.telegram.botToken || this.telegram.chatIds.length === 0) {
            this.showToast('Please configure bot token and add at least one chat ID first', 'warning');
            return;
        }
        
        const testMessage = `🔧 *MADS Test Message* 🔧\n\nYour Telegram bot is working! You'll receive emergency alerts here when accidents are detected.\n\n🚲 *Mobile Accident Detection System*`;
        
        this.showToast('📤 Sending test message...', 'info');
        
        let successCount = 0;
        
        for (const chatId of this.telegram.chatIds) {
            const sent = await this.sendTelegramMessageToChat(chatId, testMessage);
            if (sent) successCount++;
        }
        
        if (successCount > 0) {
            this.showToast(`✅ Test message sent to ${successCount} chat(s)!`, 'success');
        } else {
            this.showToast('❌ Test failed. Check your bot token', 'error');
        }
    }
    
    async sendTelegramMessage(contactName, message) {
        let successCount = 0;
        
        for (const chatId of this.telegram.chatIds) {
            const sent = await this.sendTelegramMessageToChat(chatId, message);
            if (sent) successCount++;
        }
        
        return successCount > 0;
    }
    
    async sendTelegramMessageToChat(chatId, message) {
        const url = `https://api.telegram.org/bot${this.telegram.botToken}/sendMessage`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });
            
            const data = await response.json();
            
            if (data.ok) {
                console.log(`MADS: Telegram message sent to chat ${chatId}`);
                return true;
            } else {
                console.error('MADS: Telegram API error', data);
                return false;
            }
        } catch (error) {
            console.error('MADS: Failed to send Telegram message', error);
            return false;
        }
    }
    
    setupPWA() {
        let deferredPrompt;
        const installBtn = document.getElementById('install-btn');
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            if (installBtn) installBtn.style.display = 'flex';
        });
        
        if (installBtn) {
            installBtn.addEventListener('click', async () => {
                if (!deferredPrompt) return;
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    installBtn.style.display = 'none';
                }
                deferredPrompt = null;
            });
        }
        
        window.addEventListener('appinstalled', () => {
            if (installBtn) installBtn.style.display = 'none';
            deferredPrompt = null;
        });
    }
    
    setupEventListeners() {
        document.getElementById('toggle-system')?.addEventListener('click', () => this.toggleSystem());
        document.getElementById('test-alert')?.addEventListener('click', () => this.testAlert());
        
        document.getElementById('add-contact')?.addEventListener('click', () => this.showContactModal());
        document.getElementById('cancel-contact')?.addEventListener('click', () => this.hideContactModal());
        document.getElementById('save-contact')?.addEventListener('click', () => this.saveContact());
        
        document.getElementById('cancel-alert')?.addEventListener('click', () => this.cancelAlert());
        document.getElementById('send-now')?.addEventListener('click', () => this.sendEmergencyAlert());
        
        document.getElementById('threshold')?.addEventListener('input', (e) => this.updateThreshold(e.target.value));
        document.getElementById('countdown-time')?.addEventListener('change', (e) => {
            this.countdownTime = parseInt(e.target.value);
            this.saveSettings();
        });
        document.getElementById('enable-sound')?.addEventListener('change', (e) => {
            this.settings.enableSound = e.target.checked;
            this.saveSettings();
        });
        document.getElementById('enable-vibration')?.addEventListener('change', (e) => {
            this.settings.enableVibration = e.target.checked;
            this.saveSettings();
        });
        
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                this.updateBatteryStatus(battery);
                battery.addEventListener('levelchange', () => this.updateBatteryStatus(battery));
            });
        }
    }
    
    async requestPermissions() {
        try {
            if ('Notification' in window && Notification.permission !== 'granted') {
                await Notification.requestPermission();
            }
            
            if ('geolocation' in navigator) {
                this.watchLocation();
            }
            
            if (typeof DeviceMotionEvent !== 'undefined' && 
                typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    const permission = await DeviceMotionEvent.requestPermission();
                    if (permission === 'granted') {
                        this.setupMotionSensors();
                    }
                } catch (error) {
                    console.warn('DeviceMotion permission denied:', error);
                }
            } else {
                this.setupMotionSensors();
            }
            
        } catch (error) {
            console.error('MADS: Permission request failed', error);
        }
    }
    
    setupMotionSensors() {
        if ('DeviceMotionEvent' in window) {
            window.addEventListener('devicemotion', (event) => {
                this.handleMotion(event);
            });
            
            document.getElementById('sensor-status').textContent = 'Sensors: Active';
        } else {
            document.getElementById('sensor-status').textContent = 'Sensors: Not Available';
        }
    }
    
    watchLocation() {
        if ('geolocation' in navigator) {
            navigator.geolocation.watchPosition(
                (position) => {
                    this.location = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    };
                    document.getElementById('gps-status').innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i> GPS: Active';
                },
                (error) => {
                    console.error('MADS: GPS Error', error);
                    document.getElementById('gps-status').innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i> GPS: Error';
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 10000,
                    timeout: 5000
                }
            );
        }
    }
    
    handleMotion(event) {
        const acceleration = event.accelerationIncludingGravity || event.acceleration;
        if (!acceleration) return;
        
        const gForce = Math.sqrt(
            Math.pow(acceleration.x || 0, 2) +
            Math.pow(acceleration.y || 0, 2) +
            Math.pow(acceleration.z || 0, 2)
        ) / 9.81;
        
        document.getElementById('acceleration').textContent = `${gForce.toFixed(2)} g`;
        
        this.accelerationHistory.push(gForce);
        if (this.accelerationHistory.length > this.maxHistoryLength) {
            this.accelerationHistory.shift();
        }
        
        if (this.accelerationHistory.length >= 2) {
            const jerk = Math.abs(this.accelerationHistory[this.accelerationHistory.length - 1] - 
                                this.accelerationHistory[this.accelerationHistory.length - 2]);
            document.getElementById('last-jerk').textContent = `${jerk.toFixed(2)} g/s`;
            
            if (this.isActive && !this.isDetecting && 
                gForce > this.threshold && jerk > 1.5) {
                this.detectImpact(gForce);
            }
        }
        
        const progress = Math.min((gForce / this.threshold) * 100, 100);
        document.getElementById('impact-progress').style.width = `${progress}%`;
        document.getElementById('impact-force').textContent = `${gForce.toFixed(2)} g`;
    }
    
    detectImpact(gForce) {
        this.isDetecting = true;
        this.triggerEmergencyAlert(gForce);
    }
    
    async triggerEmergencyAlert(gForce) {
        console.log(`MADS: Impact detected - ${gForce.toFixed(2)}g`);
        
        document.getElementById('system-status').innerHTML = `
            <div class="indicator alert"></div>
            <span>🚨 ALERT TRIGGERED!</span>
        `;
        
        this.showCountdownOverlay();
        
        let timeLeft = this.countdownTime;
        document.getElementById('countdown-timer').textContent = timeLeft;
        
        this.updateLocationInfo();
        this.startAlarm();
        
        this.countdownInterval = setInterval(() => {
            timeLeft--;
            document.getElementById('countdown-timer').textContent = timeLeft;
            
            if (timeLeft <= 0) {
                clearInterval(this.countdownInterval);
                this.sendEmergencyAlert();
            }
        }, 1000);
    }
    
    showCountdownOverlay() {
        document.getElementById('countdown-overlay').style.display = 'flex';
        document.body.classList.add('vibrate');
    }
    
    hideCountdownOverlay() {
        document.getElementById('countdown-overlay').style.display = 'none';
        document.body.classList.remove('vibrate');
    }
    
    startAlarm() {
        if (this.settings.enableSound) {
            const alarmSound = document.getElementById('alarm-sound');
            alarmSound.play().catch(e => console.log('MADS: Audio play failed', e));
        }
        
        if (this.settings.enableVibration && 'vibrate' in navigator) {
            navigator.vibrate([500, 200, 500, 200, 500]);
        }
    }
    
    stopAlarm() {
        const alarmSound = document.getElementById('alarm-sound');
        alarmSound.pause();
        alarmSound.currentTime = 0;
        
        if ('vibrate' in navigator) {
            navigator.vibrate(0);
        }
    }
    
    cancelAlert() {
        clearInterval(this.countdownInterval);
        this.isDetecting = false;
        this.stopAlarm();
        this.hideCountdownOverlay();
        this.updateUI();
        this.showNotification('MADS Alert Cancelled', 'System is back to monitoring');
    }
    
    async sendEmergencyAlert() {
        clearInterval(this.countdownInterval);
        this.stopAlarm();
        
        this.showProgress('🚨 MADS: Sending emergency alerts...');
        
        if (!this.location) {
            await this.getCurrentLocation();
        }
        
        let successCount = 0;
        
        // Send via Telegram if configured
        if (this.telegram.isConfigured) {
            const message = this.createTelegramMessage();
            const sent = await this.sendTelegramMessage('Emergency', message);
            if (sent) successCount = this.telegram.chatIds.length;
        } else {
            this.showToast('⚠️ Telegram not configured - please setup first', 'warning');
            this.showTelegramSetupPrompt();
        }
        
        this.hideProgress();
        
        if (successCount > 0) {
            this.showToast(`✅ MADS: Telegram alert sent to ${successCount} recipient(s)`, 'success');
        }
        
        if (successCount === 0) {
            this.showToast('⚠️ No recipients configured - add chat IDs first', 'warning');
        }
        
        this.hideCountdownOverlay();
        this.isDetecting = false;
        this.updateUI();
    }
    
    createTelegramMessage() {
        const time = new Date().toLocaleTimeString();
        const date = new Date().toLocaleDateString();
        const mapsLink = this.location ? 
            `https://maps.google.com/?q=${this.location.latitude},${this.location.longitude}` :
            'Location unavailable';
        
        return `🚨 *MADS - EMERGENCY ALERT* 🚨

*I've been in a bike accident and need immediate assistance!*

📍 *Location:* [Open in Maps](${mapsLink})
📍 *Coordinates:* \`${this.location?.latitude || 'N/A'}, ${this.location?.longitude || 'N/A'}\`
🕒 *Time:* ${time}
📅 *Date:* ${date}
📊 *Accuracy:* ±${Math.round(this.location?.accuracy || 0)}m

Please check on me immediately or call emergency services.

---
_Mobile Accident Detection System_ 🚲`;
    }
    
    async getCurrentLocation() {
        return new Promise((resolve) => {
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        this.location = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy
                        };
                        resolve(this.location);
                    },
                    (error) => {
                        console.error('MADS: Location error', error);
                        resolve(null);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    }
                );
            } else {
                resolve(null);
            }
        });
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    updateLocationInfo() {
        const locationInfo = document.getElementById('location-info');
        if (this.location) {
            locationInfo.innerHTML = `
                📍 ${this.location.latitude.toFixed(6)}, ${this.location.longitude.toFixed(6)}
                <br><small>Accuracy: ±${Math.round(this.location.accuracy)}m</small>
            `;
        } else {
            locationInfo.textContent = 'Getting location...';
            this.getCurrentLocation().then(() => {
                if (this.location) {
                    locationInfo.innerHTML = `
                        📍 ${this.location.latitude.toFixed(6)}, ${this.location.longitude.toFixed(6)}
                        <br><small>Accuracy: ±${Math.round(this.location.accuracy)}m</small>
                    `;
                }
            });
        }
    }
    
    showProgress(message) {
        const progress = document.getElementById('sms-progress');
        if (progress) {
            progress.style.display = 'flex';
            progress.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                <span>${message}</span>
            `;
        }
    }
    
    hideProgress() {
        const progress = document.getElementById('sms-progress');
        if (progress) {
            progress.style.display = 'none';
        }
    }
    
    toggleSystem() {
        this.isActive = !this.isActive;
        
        const toggleBtn = document.getElementById('toggle-system');
        const statusIndicator = document.getElementById('system-status');
        
        if (this.isActive) {
            toggleBtn.innerHTML = '<i class="fas fa-power-off"></i> Stop Protection';
            toggleBtn.classList.remove('btn-primary');
            toggleBtn.classList.add('btn-secondary');
            statusIndicator.innerHTML = `
                <div class="indicator active"></div>
                <span>🟢 MADS ACTIVE</span>
            `;
            this.showNotification('MADS Activated', 'Monitoring for accidents');
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-power-off"></i> Start Protection';
            toggleBtn.classList.remove('btn-secondary');
            toggleBtn.classList.add('btn-primary');
            statusIndicator.innerHTML = `
                <div class="indicator inactive"></div>
                <span>⚫ MADS INACTIVE</span>
            `;
            this.showNotification('MADS Deactivated', 'System is off');
        }
    }
    
    testAlert() {
        if (!this.isActive) {
            this.showNotification('MADS', 'Please activate system first');
            return;
        }
        
        this.detectImpact(this.threshold + 1);
        this.showNotification('MADS Test', 'Test alert initiated');
    }
    
    updateThreshold(value) {
        this.threshold = parseFloat(value);
        document.getElementById('threshold-value').textContent = `${value}g`;
        document.getElementById('threshold-display').textContent = `${value}g`;
        this.saveSettings();
    }
    
    showContactModal() {
        document.getElementById('contact-modal').style.display = 'flex';
    }
    
    hideContactModal() {
        document.getElementById('contact-modal').style.display = 'none';
        document.getElementById('contact-name').value = '';
        document.getElementById('contact-phone').value = '';
    }
    
    saveContact() {
        const name = document.getElementById('contact-name').value.trim();
        const phone = document.getElementById('contact-phone').value.trim();
        
        if (!name || !phone) {
            this.showNotification('MADS', 'Please fill all fields');
            return;
        }
        
        const cleanPhone = phone.replace(/\D/g, '');
        
        const contact = {
            id: Date.now(),
            name: name,
            phone: cleanPhone
        };
        
        this.contacts.push(contact);
        this.saveContacts();
        this.renderContacts();
        this.hideContactModal();
        
        this.showNotification('MADS', `${name} added to emergency contacts`);
    }
    
    deleteContact(id) {
        if (confirm('Remove this emergency contact?')) {
            this.contacts = this.contacts.filter(contact => contact.id !== id);
            this.saveContacts();
            this.renderContacts();
            this.showNotification('MADS', 'Contact removed');
        }
    }
    
    renderContacts() {
        const contactsList = document.getElementById('contacts-list');
        
        if (this.contacts.length === 0) {
            contactsList.innerHTML = `
                <div class="empty-contacts">
                    <i class="fas fa-user-plus"></i>
                    <p>No emergency contacts added</p>
                    <small>Add contacts who will receive MADS alerts</small>
                </div>
            `;
            return;
        }
        
        contactsList.innerHTML = this.contacts.map(contact => `
            <div class="contact-item">
                <div class="contact-info">
                    <h4>
                        ${contact.name}
                        <span class="sms-badge telegram">
                            <i class="fab fa-telegram"></i> Telegram
                        </span>
                    </h4>
                    <p>${contact.phone}</p>
                    <small>MADS Emergency Contact</small>
                </div>
                <button class="delete-contact" onclick="mads.deleteContact(${contact.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }
    
    updateUI() {
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                this.updateBatteryStatus(battery);
            });
        }
    }
    
    updateBatteryStatus(battery) {
        const batteryElem = document.getElementById('battery-status');
        const level = Math.round(battery.level * 100);
        
        batteryElem.innerHTML = `<i class="fas fa-battery-${this.getBatteryIcon(level)}"></i> ${level}%`;
        
        if (battery.charging) {
            batteryElem.innerHTML += ' ⚡';
        }
    }
    
    getBatteryIcon(level) {
        if (level >= 90) return 'full';
        if (level >= 60) return 'three-quarters';
        if (level >= 30) return 'half';
        if (level >= 10) return 'quarter';
        return 'empty';
    }
    
    showNotification(title, message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`MADS: ${title}`, {
                body: message,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚲</text></svg>'
            });
        }
        this.showToast(message);
    }
    
    showToast(message, type = 'info') {
        let toast = document.getElementById('mads-toast');
        
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'mads-toast';
            toast.className = 'mads-toast';
            document.body.appendChild(toast);
        }
        
        toast.className = `mads-toast ${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas ${this.getToastIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;
        
        toast.style.display = 'block';
        
        setTimeout(() => {
            toast.style.animation = 'slideDown 0.3s ease';
            setTimeout(() => {
                toast.style.display = 'none';
                toast.style.animation = '';
            }, 300);
        }, 3000);
    }
    
    getToastIcon(type) {
        switch(type) {
            case 'success': return 'fa-check-circle';
            case 'warning': return 'fa-exclamation-triangle';
            case 'error': return 'fa-times-circle';
            default: return 'fa-info-circle';
        }
    }
    
    saveData() {
        const data = {
            contacts: this.contacts,
            settings: this.settings,
            threshold: this.threshold,
            countdownTime: this.countdownTime
        };
        localStorage.setItem('mads_data', JSON.stringify(data));
    }
    
    loadData() {
        const saved = localStorage.getItem('mads_data');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.contacts = data.contacts || [];
                this.settings = { ...this.settings, ...(data.settings || {}) };
                this.threshold = data.threshold || 3.5;
                this.countdownTime = data.countdownTime || 10;
                
                document.getElementById('threshold').value = this.threshold;
                document.getElementById('threshold-display').textContent = `${this.threshold}g`;
                document.getElementById('threshold-value').textContent = `${this.threshold}g`;
                document.getElementById('countdown-time').value = this.countdownTime;
                document.getElementById('enable-sound').checked = this.settings.enableSound;
                document.getElementById('enable-vibration').checked = this.settings.enableVibration;
                
                this.renderContacts();
            } catch (e) {
                console.error('MADS: Failed to load saved data', e);
            }
        }
    }
    
    saveSettings() {
        this.saveData();
    }
    
    saveContacts() {
        this.saveData();
    }
}

// Initialize MADS
const mads = new MADS();
window.mads = mads;

// Add styles for MADS
document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        .mads-toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--primary);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 10001;
            animation: slideUp 0.3s ease;
            display: none;
        }
        
        .mads-toast.success {
            background: var(--success);
        }
        
        .mads-toast.warning {
            background: var(--warning);
        }
        
        .mads-toast.error {
            background: var(--danger);
        }
        
        .toast-content {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translate(-50%, 20px);
            }
            to {
                opacity: 1;
                transform: translate(-50%, 0);
            }
        }
        
        @keyframes slideDown {
            from {
                opacity: 1;
                transform: translate(-50%, 0);
            }
            to {
                opacity: 0;
                transform: translate(-50%, 20px);
            }
        }
        
        .telegram-setup-modal {
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
        }
        
        .telegram-setup-modal .modal-header {
            text-align: center;
            margin-bottom: 20px;
        }
        
        .telegram-setup-modal .modal-header h2 {
            margin: 10px 0 5px;
        }
        
        .telegram-setup-modal .setup-steps {
            margin: 20px 0;
        }
        
        .telegram-setup-modal .step {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
            padding: 15px;
            background: rgba(0, 136, 204, 0.1);
            border-radius: 12px;
            border-left: 4px solid #0088cc;
        }
        
        .telegram-setup-modal .step-number {
            width: 30px;
            height: 30px;
            background: #0088cc;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            flex-shrink: 0;
        }
        
        .telegram-setup-modal .step-content {
            flex: 1;
        }
        
        .telegram-setup-modal .step-content h4 {
            margin-bottom: 8px;
            color: #0088cc;
        }
        
        .telegram-setup-modal .info-box {
            background: var(--card-bg);
            padding: 12px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 10px 0;
            border: 1px solid var(--border);
        }
        
        .telegram-setup-modal .info-box code {
            flex: 1;
            font-family: monospace;
            font-size: 14px;
            word-break: break-all;
        }
        
        .telegram-setup-modal .copy-btn {
            background: var(--secondary);
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 5px;
            white-space: nowrap;
        }
        
        .telegram-setup-modal .copy-btn:hover {
            background: var(--secondary-dark);
        }
        
        .telegram-setup-modal .input-group {
            margin: 15px 0;
        }
        
        .telegram-setup-modal .input-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
        }
        
        .telegram-setup-modal .input-group input {
            width: 100%;
            padding: 10px;
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            color: var(--text);
            font-size: 14px;
        }
        
        .telegram-setup-modal .input-group small {
            display: block;
            color: var(--text-secondary);
            font-size: 11px;
            margin-top: 4px;
        }
        
        .telegram-setup-modal .instruction-list {
            margin: 10px 0;
            padding-left: 20px;
            color: var(--text-secondary);
        }
        
        .telegram-setup-modal .instruction-list li {
            margin-bottom: 5px;
        }
        
        .telegram-setup-modal .token-example {
            background: var(--background);
            font-family: monospace;
            word-break: break-all;
        }
        
        .telegram-setup-modal .success-message {
            background: rgba(22, 163, 74, 0.2);
            color: var(--success);
            padding: 10px;
            border-radius: 8px;
            margin: 10px 0;
        }
        
        .telegram-setup-modal .warning-message {
            background: rgba(234, 88, 12, 0.2);
            color: var(--warning);
            padding: 10px;
            border-radius: 8px;
            margin: 10px 0;
        }
        
        .telegram-setup-modal .error-message {
            background: rgba(239, 68, 68, 0.2);
            color: var(--danger);
            padding: 10px;
            border-radius: 8px;
            margin: 10px 0;
        }
        
        .telegram-setup-modal .saved-chats {
            margin-top: 15px;
            padding: 10px;
            background: var(--card-bg);
            border-radius: 8px;
        }
        
        .telegram-setup-modal .chat-id-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px;
            background: var(--background);
            border-radius: 4px;
            margin-bottom: 5px;
        }
        
        .telegram-setup-modal .chat-id-item code {
            font-family: monospace;
            font-size: 12px;
        }
        
        .telegram-setup-modal .delete-chat {
            background: none;
            border: none;
            color: var(--danger);
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
        }
        
        .telegram-setup-modal .delete-chat:hover {
            background: rgba(239, 68, 68, 0.1);
        }
        
        .telegram-setup-modal .test-section {
            margin: 20px 0;
            text-align: center;
        }
        
        .telegram-setup-modal .modal-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        .telegram-setup-modal .modal-actions .btn {
            flex: 1;
        }
        
        .telegram-setup-modal .note {
            margin-top: 15px;
            padding: 10px;
            background: rgba(0, 136, 204, 0.1);
            border-radius: 8px;
            text-align: center;
        }
        
        .sms-badge.telegram {
            background: #0088cc;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            margin-left: 8px;
        }
        
        .sms-badge.telegram i {
            margin-right: 4px;
        }
        
        #telegram-setup-btn {
            margin: 10px 0;
            width: 100%;
            background: #0088cc;
            color: white;
            font-weight: bold;
            padding: 15px;
        }
        
        #telegram-setup-btn:hover {
            background: #006699;
        }
        
        #telegram-setup-btn i {
            font-size: 1.2rem;
        }
        
        .small {
            font-size: 12px;
            color: var(--text-secondary);
        }
    `;
    document.head.appendChild(style);
    
    // Add Telegram status to status bar if not exists
    if (!document.getElementById('telegram-status')) {
        const statusBar = document.querySelector('.status-bar');
        if (statusBar) {
            const telegramStatus = document.createElement('div');
            telegramStatus.className = 'status-item';
            telegramStatus.id = 'telegram-status';
            telegramStatus.innerHTML = '<i class="fab fa-telegram"></i> Telegram: Checking';
            statusBar.appendChild(telegramStatus);
        }
    }
    
    // Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(error => {
            console.log('MADS: Service Worker failed', error);
        });
    }
});
