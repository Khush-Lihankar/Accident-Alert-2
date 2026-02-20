/**
 * MADS - Mobile Accident Detection System
 * Uses CallMeBot for automatic WhatsApp alerts
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
            notificationMethod: 'whatsapp'
        };
        
        // CallMeBot configuration
        this.callmebot = {
            apiKey: localStorage.getItem('mads_callmebot_apikey') || '',
            phoneNumber: localStorage.getItem('mads_callmebot_phone') || '',
            isConfigured: false
        };
        
        this.init();
    }
    
    async init() {
        this.setupPWA();
        this.loadData();
        this.setupEventListeners();
        await this.requestPermissions();
        this.checkCallMeBotConfig();
        this.updateUI();
        console.log('MADS initialized - Mobile Accident Detection System');
    }
    
    checkCallMeBotConfig() {
        this.callmebot.isConfigured = !!(this.callmebot.apiKey && this.callmebot.phoneNumber);
        
        const whatsappStatus = document.getElementById('whatsapp-status');
        if (whatsappStatus) {
            if (this.callmebot.isConfigured) {
                whatsappStatus.innerHTML = '<i class="fab fa-whatsapp" style="color: #25D366;"></i> WhatsApp: Ready';
                whatsappStatus.style.color = '#25D366';
                
                // Remove setup button if exists
                const setupBtn = document.getElementById('whatsapp-setup-btn');
                if (setupBtn) setupBtn.remove();
            } else {
                whatsappStatus.innerHTML = '<i class="fab fa-whatsapp"></i> WhatsApp: Setup needed';
                whatsappStatus.style.color = 'var(--warning)';
                this.showWhatsAppSetupPrompt();
            }
        }
    }
    
    showWhatsAppSetupPrompt() {
        // Remove existing button if any
        const existingBtn = document.getElementById('whatsapp-setup-btn');
        if (existingBtn) existingBtn.remove();
        
        const setupBtn = document.createElement('button');
        setupBtn.id = 'whatsapp-setup-btn';
        setupBtn.className = 'btn btn-secondary';
        setupBtn.innerHTML = '<i class="fab fa-whatsapp"></i> Setup WhatsApp Alerts';
        setupBtn.onclick = () => this.showWhatsAppSetupModal();
        
        // Find a good place to insert the button
        const contactsCard = document.querySelector('.card:has(.contacts-list)');
        if (contactsCard) {
            contactsCard.parentNode.insertBefore(setupBtn, contactsCard.nextSibling);
        }
    }
    
    showWhatsAppSetupModal() {
        // Remove any existing modal
        const existingModal = document.getElementById('whatsapp-setup-modal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.className = 'overlay';
        modal.id = 'whatsapp-setup-modal';
        modal.style.display = 'flex';
        
        modal.innerHTML = `
            <div class="modal whatsapp-setup-modal">
                <div class="modal-header">
                    <i class="fab fa-whatsapp" style="color: #25D366; font-size: 2rem;"></i>
                    <h2>Setup WhatsApp Alerts</h2>
                    <p class="subtitle">MADS - Mobile Accident Detection System</p>
                </div>
                
                <div class="setup-steps">
                    <div class="step">
                        <div class="step-number">1</div>
                        <div class="step-content">
                            <h4>Save CallMeBot Number</h4>
                            <p>Add this number to your phone contacts:</p>
                            <div class="info-box">
                                <code>+34 644 51 95 23</code>
                                <button class="copy-btn" onclick="navigator.clipboard.writeText('+34644519523'); this.innerHTML='<i class=\\'fas fa-check\\'></i> Copied!'; setTimeout(() => this.innerHTML='<i class=\\'fas fa-copy\\'></i> Copy', 2000)">
                                    <i class="fas fa-copy"></i> Copy
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-number">2</div>
                        <div class="step-content">
                            <h4>Send Activation Message</h4>
                            <p>Open WhatsApp and send this exact message:</p>
                            <div class="info-box">
                                <code>"I allow callmebot to send me messages"</code>
                                <button class="copy-btn" onclick="navigator.clipboard.writeText('I allow callmebot to send me messages'); this.innerHTML='<i class=\\'fas fa-check\\'></i> Copied!'; setTimeout(() => this.innerHTML='<i class=\\'fas fa-copy\\'></i> Copy', 2000)">
                                    <i class="fas fa-copy"></i> Copy
                                </button>
                            </div>
                            <button class="btn btn-primary" style="margin-top: 10px;" onclick="window.open('https://wa.me/34644519523?text=' + encodeURIComponent('I allow callmebot to send me messages'))">
                                <i class="fab fa-whatsapp"></i> Open WhatsApp
                            </button>
                        </div>
                    </div>
                    
                    <div class="step">
                        <div class="step-number">3</div>
                        <div class="step-content">
                            <h4>Enter Your Details</h4>
                            <p>You'll receive an API key from CallMeBot. Enter it below:</p>
                            
                            <div class="input-group">
                                <label for="callmebot-phone">Your WhatsApp Number</label>
                                <input type="tel" id="callmebot-phone" placeholder="e.g., 5511999999999" value="${this.callmebot.phoneNumber}">
                                <small>Include country code without + or spaces (e.g., 1 for USA, 44 for UK)</small>
                            </div>
                            
                            <div class="input-group">
                                <label for="callmebot-apikey">CallMeBot API Key</label>
                                <input type="text" id="callmebot-apikey" placeholder="e.g., 123456" value="${this.callmebot.apiKey}">
                                <small>The number you received from CallMeBot</small>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="test-section">
                    <button class="btn btn-test" onclick="mads.testWhatsApp()">
                        <i class="fas fa-vial"></i> Test WhatsApp Setup
                    </button>
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="document.getElementById('whatsapp-setup-modal').remove()">
                        Cancel
                    </button>
                    <button class="btn btn-primary" onclick="mads.saveWhatsAppConfig()">
                        <i class="fas fa-save"></i> Save Configuration
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    async testWhatsApp() {
        const phone = document.getElementById('callmebot-phone')?.value.trim();
        const apiKey = document.getElementById('callmebot-apikey')?.value.trim();
        
        if (!phone || !apiKey) {
            this.showToast('Please enter your phone number and API key first', 'warning');
            return;
        }
        
        const testMessage = `🔧 MADS Test Message\n\nYour WhatsApp setup is working! You'll receive emergency alerts here when accidents are detected.`;
        const encodedMessage = encodeURIComponent(testMessage);
        const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedMessage}&apikey=${apiKey}`;
        
        try {
            this.showToast('Sending test message...', 'info');
            const response = await fetch(url);
            const text = await response.text();
            
            if (response.status === 200 && text.includes('Message sent')) {
                this.showToast('✅ Test message sent! Check your WhatsApp', 'success');
            } else {
                this.showToast('❌ Test failed. Check your API key and phone number', 'error');
            }
        } catch (error) {
            this.showToast('❌ Network error. Please try again', 'error');
        }
    }
    
    saveWhatsAppConfig() {
        const phone = document.getElementById('callmebot-phone')?.value.trim();
        const apiKey = document.getElementById('callmebot-apikey')?.value.trim();
        
        if (!phone || !apiKey) {
            this.showToast('Please enter both phone number and API key', 'error');
            return;
        }
        
        // Clean phone number (remove all non-digits)
        const cleanPhone = phone.replace(/\D/g, '');
        
        if (cleanPhone.length < 10) {
            this.showToast('Please enter a valid phone number with country code', 'error');
            return;
        }
        
        this.callmebot.phoneNumber = cleanPhone;
        this.callmebot.apiKey = apiKey;
        this.callmebot.isConfigured = true;
        
        // Save to localStorage
        localStorage.setItem('mads_callmebot_phone', cleanPhone);
        localStorage.setItem('mads_callmebot_apikey', apiKey);
        
        // Remove modal
        document.getElementById('whatsapp-setup-modal')?.remove();
        
        // Update UI
        this.checkCallMeBotConfig();
        this.showToast('✅ WhatsApp configured successfully!', 'success');
        
        // Send confirmation message
        this.sendTestConfirmation();
    }
    
    async sendTestConfirmation() {
        const message = `✅ *MADS Setup Complete* ✅\n\nMobile Accident Detection System is now configured to send alerts to this WhatsApp number.\n\nYou will be notified immediately if an accident is detected. Stay safe! 🚲`;
        
        await this.sendWhatsAppMessage(this.contacts[0]?.name || 'User', message);
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
        
        const methodSelect = document.getElementById('notification-method');
        if (methodSelect) {
            methodSelect.value = this.settings.notificationMethod;
            methodSelect.addEventListener('change', (e) => {
                this.settings.notificationMethod = e.target.value;
                this.saveSettings();
            });
        }
        
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
                    document.getElementById('gps-status').textHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i> GPS: Active';
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
        
        // Update impact color based on severity
        const progressFill = document.getElementById('impact-progress');
        if (gForce > this.threshold) {
            progressFill.style.background = 'linear-gradient(90deg, var(--warning), var(--primary))';
        } else if (gForce > this.threshold * 0.7) {
            progressFill.style.background = 'linear-gradient(90deg, var(--safe), var(--warning))';
        } else {
            progressFill.style.background = 'linear-gradient(90deg, var(--safe), var(--warning), var(--primary))';
        }
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
        let failCount = 0;
        
        for (const contact of this.contacts) {
            if (this.settings.notificationMethod === 'whatsapp' && this.callmebot.isConfigured) {
                const sent = await this.sendWhatsAppAlert(contact);
                if (sent) {
                    successCount++;
                } else {
                    failCount++;
                }
            } else {
                // Fallback to SMS
                this.sendSMSFallback(contact);
                failCount++;
            }
            await this.delay(1000);
        }
        
        this.hideProgress();
        
        if (successCount > 0) {
            this.showToast(`✅ MADS: WhatsApp alert sent to ${successCount} contact(s)`, 'success');
        }
        
        if (failCount > 0) {
            this.showToast(`⚠️ MADS: ${failCount} alert(s) failed - check WhatsApp setup`, 'warning');
        }
        
        this.hideCountdownOverlay();
        this.isDetecting = false;
        this.updateUI();
    }
    
    async sendWhatsAppAlert(contact) {
        if (!this.callmebot.isConfigured) {
            this.showToast('⚠️ WhatsApp not configured', 'warning');
            return false;
        }
        
        const message = this.createWhatsAppMessage(contact.name);
        return await this.sendWhatsAppMessage(contact.name, message);
    }
    
    async sendWhatsAppMessage(contactName, message) {
        const encodedMessage = encodeURIComponent(message);
        const url = `https://api.callmebot.com/whatsapp.php?phone=${this.callmebot.phoneNumber}&text=${encodedMessage}&apikey=${this.callmebot.apiKey}`;
        
        try {
            const response = await fetch(url);
            const responseText = await response.text();
            
            if (response.status === 200 && responseText.includes('Message sent')) {
                console.log(`MADS: WhatsApp alert sent to ${contactName}`);
                return true;
            } else {
                console.error('MADS: WhatsApp API error', responseText);
                return false;
            }
        } catch (error) {
            console.error('MADS: Failed to send WhatsApp', error);
            return false;
        }
    }
    
    sendSMSFallback(contact) {
        const message = this.createEmergencyMessage(contact.name);
        const smsUri = `sms:${contact.phone}?body=${encodeURIComponent(message)}`;
        window.open(smsUri, '_blank');
    }
    
    createWhatsAppMessage(contactName) {
        const time = new Date().toLocaleTimeString();
        const date = new Date().toLocaleDateString();
        const mapsLink = this.location ? 
            `https://maps.google.com/?q=${this.location.latitude},${this.location.longitude}` :
            'Location unavailable';
        
        return `🚨 *MADS - MOBILE ACCIDENT DETECTION SYSTEM* 🚨

*EMERGENCY ALERT!*

I've been in a bike accident and need immediate assistance!

📍 *Location:* ${mapsLink}
📍 *Coordinates:* ${this.location?.latitude || 'N/A'}, ${this.location?.longitude || 'N/A'}
🕒 *Time:* ${time}
📅 *Date:* ${date}
📊 *Accuracy:* ±${Math.round(this.location?.accuracy || 0)}m

Please check on me immediately or call emergency services.

---
*MADS - Keeping riders safe* 🚲
_This is an automated emergency alert_`;
    }
    
    createEmergencyMessage(contactName) {
        const time = new Date().toLocaleTimeString();
        const date = new Date().toLocaleDateString();
        const mapsLink = this.location ? 
            `https://maps.google.com/?q=${this.location.latitude},${this.location.longitude}` :
            'Location unavailable';
        
        return `MADS EMERGENCY: Bike accident at ${mapsLink} (${time} ${date})`;
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
                        <span class="sms-badge whatsapp">
                            <i class="fab fa-whatsapp"></i> WhatsApp
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
                
                const methodSelect = document.getElementById('notification-method');
                if (methodSelect) {
                    methodSelect.value = this.settings.notificationMethod;
                }
                
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
        
        .whatsapp-setup-modal {
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
        }
        
        .whatsapp-setup-modal .modal-header {
            text-align: center;
            margin-bottom: 20px;
        }
        
        .whatsapp-setup-modal .modal-header h2 {
            margin: 10px 0 5px;
        }
        
        .whatsapp-setup-modal .setup-steps {
            margin: 20px 0;
        }
        
        .whatsapp-setup-modal .step {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
            padding: 15px;
            background: rgba(37, 211, 102, 0.1);
            border-radius: 12px;
            border-left: 4px solid #25D366;
        }
        
        .whatsapp-setup-modal .step-number {
            width: 30px;
            height: 30px;
            background: #25D366;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            flex-shrink: 0;
        }
        
        .whatsapp-setup-modal .step-content {
            flex: 1;
        }
        
        .whatsapp-setup-modal .step-content h4 {
            margin-bottom: 8px;
            color: #25D366;
        }
        
        .whatsapp-setup-modal .info-box {
            background: var(--card-bg);
            padding: 12px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 10px 0;
            border: 1px solid var(--border);
        }
        
        .whatsapp-setup-modal .info-box code {
            flex: 1;
            font-family: monospace;
            font-size: 14px;
            word-break: break-all;
        }
        
        .whatsapp-setup-modal .copy-btn {
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
        
        .whatsapp-setup-modal .copy-btn:hover {
            background: var(--secondary-dark);
        }
        
        .whatsapp-setup-modal .input-group {
            margin: 15px 0;
        }
        
        .whatsapp-setup-modal .input-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
        }
        
        .whatsapp-setup-modal .input-group input {
            width: 100%;
            padding: 10px;
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            color: var(--text);
            font-size: 14px;
        }
        
        .whatsapp-setup-modal .input-group small {
            display: block;
            color: var(--text-secondary);
            font-size: 11px;
            margin-top: 4px;
        }
        
        .whatsapp-setup-modal .test-section {
            margin: 20px 0;
            text-align: center;
        }
        
        .whatsapp-setup-modal .modal-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        .whatsapp-setup-modal .modal-actions .btn {
            flex: 1;
        }
        
        .sms-badge.whatsapp {
            background: #25D366;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            margin-left: 8px;
        }
        
        .sms-badge.whatsapp i {
            margin-right: 4px;
        }
        
        #whatsapp-setup-btn {
            margin: 10px 0;
            width: 100%;
            background: #25D366;
            color: white;
        }
        
        #whatsapp-setup-btn:hover {
            background: #128C7E;
        }
    `;
    document.head.appendChild(style);
    
    // Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(error => {
            console.log('MADS: Service Worker failed', error);
        });
    }
});
