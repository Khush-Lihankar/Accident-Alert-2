/**
 * MADS - Mobile Accident Detection System
 * Features:
 * - Speed-based auto-activation (>20 km/h)
 * - Speed drop detection for crashes
 * - Background monitoring with notifications
 * - WhatsApp alerts via CallMeBot
 */

class MADS {
    constructor() {
        // System state
        this.isActive = false;
        this.isDetecting = false;
        this.isBackgroundMode = false;
        
        // Detection parameters
        this.threshold = 3.5; // g-force threshold
        this.speedThreshold = 20; // km/h for auto-activation
        this.speedDropThreshold = 25; // km/h drop to detect crash
        this.countdownTime = 10; // seconds
        
        // Data history
        this.accelerationHistory = [];
        this.speedHistory = [];
        this.maxHistoryLength = 20;
        this.lastSpeed = 0;
        this.speedDropTimer = null;
        this.deactivationTimer = null;
        
        // Location and contacts
        this.location = null;
        this.contacts = [];
        
        // Countdown
        this.countdownInterval = null;
        
        // Settings
        this.settings = {
            enableSound: true,
            enableVibration: true,
            backgroundMonitoring: true
        };
        
        // WhatsApp configuration
        this.whatsapp = {
            apiKey: localStorage.getItem('mads_whatsapp_apikey') || '',
            phoneNumber: localStorage.getItem('mads_whatsapp_phone') || '',
            isConfigured: false
        };
        
        this.init();
    }
    
    async init() {
        this.setupPWA();
        this.loadData();
        this.setupEventListeners();
        await this.requestPermissions();
        this.checkWhatsAppConfig();
        this.startBackgroundMonitoring();
        this.updateUI();
        console.log('MADS initialized - Mobile Accident Detection System');
    }
    
    setupEventListeners() {
        // Manual controls
        document.getElementById('toggle-system')?.addEventListener('click', () => this.manualToggle());
        document.getElementById('force-stop')?.addEventListener('click', () => this.forceStop());
        
        // Test buttons
        document.getElementById('test-impact')?.addEventListener('click', () => this.testImpact());
        document.getElementById('test-speed-drop')?.addEventListener('click', () => this.testSpeedDrop());
        document.getElementById('test-whatsapp')?.addEventListener('click', () => this.testWhatsApp());
        
        // Contact management
        document.getElementById('add-contact')?.addEventListener('click', () => this.showContactModal());
        document.getElementById('cancel-contact')?.addEventListener('click', () => this.hideContactModal());
        document.getElementById('save-contact')?.addEventListener('click', () => this.saveContact());
        
        // WhatsApp setup
        document.getElementById('setup-whatsapp')?.addEventListener('click', () => this.showWhatsAppModal());
        document.getElementById('cancel-whatsapp')?.addEventListener('click', () => this.hideWhatsAppModal());
        document.getElementById('save-whatsapp')?.addEventListener('click', () => this.saveWhatsAppConfig());
        
        // Countdown controls
        document.getElementById('cancel-alert')?.addEventListener('click', () => this.cancelAlert());
        document.getElementById('send-now')?.addEventListener('click', () => this.sendEmergencyAlert());
        
        // Settings
        document.getElementById('threshold')?.addEventListener('input', (e) => this.updateThreshold(e.target.value));
        document.getElementById('speed-threshold')?.addEventListener('input', (e) => this.updateSpeedThreshold(e.target.value));
        document.getElementById('speed-drop-threshold')?.addEventListener('input', (e) => this.updateSpeedDropThreshold(e.target.value));
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
        document.getElementById('background-monitoring')?.addEventListener('change', (e) => {
            this.settings.backgroundMonitoring = e.target.checked;
            this.saveSettings();
            if (e.target.checked) {
                this.startBackgroundMonitoring();
            }
        });
        
        // Battery monitoring
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                this.updateBatteryStatus(battery);
                battery.addEventListener('levelchange', () => this.updateBatteryStatus(battery));
            });
        }
    }
    
    async requestPermissions() {
        try {
            // Notification permission
            if ('Notification' in window && Notification.permission !== 'granted') {
                await Notification.requestPermission();
            }
            
            // Geolocation for speed and location
            if ('geolocation' in navigator) {
                this.watchLocation();
            }
            
            // Motion sensors
            if (typeof DeviceMotionEvent !== 'undefined' && 
                typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    const permission = await DeviceMotionEvent.requestPermission();
                    if (permission === 'granted') {
                        this.setupMotionSensors();
                    }
                } catch (error) {
                    console.warn('Motion permission denied:', error);
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
            document.getElementById('sensor-status').innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i> Sensors: Active';
        }
    }
    
    watchLocation() {
        if ('geolocation' in navigator) {
            navigator.geolocation.watchPosition(
                (position) => {
                    // Update location
                    this.location = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        speed: position.coords.speed || 0
                    };
                    
                    // Calculate speed in km/h
                    const speedKmh = (this.location.speed * 3.6).toFixed(1);
                    this.updateSpeed(speedKmh);
                    
                    document.getElementById('gps-status').innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i> GPS: Active';
                },
                (error) => {
                    console.error('GPS Error:', error);
                    document.getElementById('gps-status').innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i> GPS: Error';
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 1000,
                    timeout: 5000
                }
            );
        }
    }
    
    updateSpeed(speed) {
        // Store in history
        this.speedHistory.push({
            speed: parseFloat(speed),
            timestamp: Date.now()
        });
        
        if (this.speedHistory.length > this.maxHistoryLength) {
            this.speedHistory.shift();
        }
        
        // Update display
        document.getElementById('current-speed').textContent = speed;
        document.getElementById('speed-status').innerHTML = `<i class="fas fa-tachometer-alt"></i> Speed: ${speed} km/h`;
        
        // Update threshold bar
        const speedPercent = Math.min((parseFloat(speed) / this.speedThreshold) * 100, 100);
        document.getElementById('speed-threshold-fill').style.width = `${speedPercent}%`;
        
        // Auto-activation logic
        this.checkAutoActivation(parseFloat(speed));
        
        // Check for speed drop (crash detection)
        this.checkSpeedDrop(parseFloat(speed));
        
        // Update speed history display
        this.updateSpeedHistory();
    }
    
    checkAutoActivation(currentSpeed) {
        if (!this.settings.backgroundMonitoring) return;
        
        if (currentSpeed >= this.speedThreshold && !this.isActive) {
            // Speed crossed threshold - activate protection
            this.activateProtection('Speed > ' + this.speedThreshold + ' km/h');
        } else if (currentSpeed < this.speedThreshold && this.isActive && !this.isDetecting) {
            // Speed dropped below threshold - schedule deactivation
            this.scheduleDeactivation();
        } else if (currentSpeed >= this.speedThreshold && this.deactivationTimer) {
            // Speed went back up - cancel deactivation
            this.cancelDeactivation();
        }
    }
    
    activateProtection(reason) {
        this.isActive = true;
        this.cancelDeactivation();
        
        // Update UI
        document.getElementById('system-status').innerHTML = `
            <div class="indicator active"></div>
            <span>🟢 PROTECTION ACTIVE</span>
        `;
        document.getElementById('protection-reason').innerHTML = `<small>Active: ${reason}</small>`;
        document.getElementById('toggle-system').style.display = 'none';
        document.getElementById('force-stop').style.display = 'block';
        
        // Show notification
        this.showNotification('MADS Protection Active', 'Monitoring for accidents');
        
        // If in background, show persistent notification
        if (document.hidden) {
            this.showBackgroundNotification('Protection Active', 'Speed: ' + document.getElementById('current-speed').textContent + ' km/h');
        }
    }
    
    deactivateProtection(reason) {
        this.isActive = false;
        
        // Update UI
        document.getElementById('system-status').innerHTML = `
            <div class="indicator inactive"></div>
            <span>⚫ PROTECTION INACTIVE</span>
        `;
        document.getElementById('protection-reason').innerHTML = `<small>${reason || 'Waiting for speed > 20 km/h'}</small>`;
        document.getElementById('toggle-system').style.display = 'block';
        document.getElementById('force-stop').style.display = 'none';
    }
    
    scheduleDeactivation() {
        if (this.deactivationTimer) return;
        
        this.deactivationTimer = setTimeout(() => {
            this.deactivateProtection('Speed below threshold for 10 seconds');
            this.deactivationTimer = null;
        }, 10000); // 10 seconds delay
        
        document.getElementById('protection-reason').innerHTML = '<small>Deactivating in 10s if speed stays low...</small>';
    }
    
    cancelDeactivation() {
        if (this.deactivationTimer) {
            clearTimeout(this.deactivationTimer);
            this.deactivationTimer = null;
        }
    }
    
    checkSpeedDrop(currentSpeed) {
        if (!this.isActive || this.isDetecting) return;
        
        // Calculate speed drop from history
        if (this.speedHistory.length > 2) {
            const prevSpeed = this.speedHistory[this.speedHistory.length - 2].speed;
            const speedDrop = prevSpeed - currentSpeed;
            
            document.getElementById('speed-drop').textContent = speedDrop.toFixed(1) + ' km/h';
            
            // If speed drops suddenly more than threshold
            if (speedDrop > this.speedDropThreshold) {
                console.log(`MADS: Speed drop detected - ${speedDrop.toFixed(1)} km/h`);
                this.detectCrash('speed_drop', speedDrop);
            }
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
            
            // Check for impact
            if (this.isActive && !this.isDetecting && gForce > this.threshold && jerk > 1.5) {
                this.detectCrash('impact', gForce);
            }
        }
        
        // Update progress bar
        const progress = Math.min((gForce / this.threshold) * 100, 100);
        document.getElementById('impact-progress').style.width = `${progress}%`;
        document.getElementById('impact-force').textContent = `${gForce.toFixed(2)} g`;
    }
    
    detectCrash(type, value) {
        this.isDetecting = true;
        
        let reason = '';
        if (type === 'impact') {
            reason = `Impact detected: ${value.toFixed(1)}g`;
        } else {
            reason = `Sudden speed drop: ${value.toFixed(1)} km/h`;
        }
        
        this.triggerEmergencyAlert(reason);
    }
    
    async triggerEmergencyAlert(reason) {
        console.log(`MADS: Crash detected - ${reason}`);
        
        document.getElementById('system-status').innerHTML = `
            <div class="indicator alert"></div>
            <span>🚨 CRASH DETECTED!</span>
        `;
        
        this.showCountdownOverlay(reason);
        
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
    
    showCountdownOverlay(reason) {
        document.getElementById('detection-reason').textContent = reason;
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
            alarmSound.play().catch(e => console.log('Audio play failed:', e));
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
        this.showNotification('Alert Cancelled', 'System is back to monitoring');
    }
    
    async sendEmergencyAlert() {
        clearInterval(this.countdownInterval);
        this.stopAlarm();
        
        this.showProgress('🚨 Sending emergency alerts...');
        
        if (!this.location) {
            await this.getCurrentLocation();
        }
        
        let successCount = 0;
        
        // Send WhatsApp alerts if configured
        if (this.whatsapp.isConfigured) {
            const message = this.createWhatsAppMessage();
            const sent = await this.sendWhatsAppAlert(message);
            if (sent) successCount = this.contacts.length;
        }
        
        this.hideProgress();
        
        if (successCount > 0) {
            this.showToast(`✅ Emergency alerts sent to ${successCount} contact(s)`, 'success');
        } else {
            this.showToast('⚠️ No WhatsApp configured - please setup alerts', 'warning');
            this.showWhatsAppModal();
        }
        
        this.hideCountdownOverlay();
        this.isDetecting = false;
        this.updateUI();
    }
    
    createWhatsAppMessage() {
        const time = new Date().toLocaleTimeString();
        const date = new Date().toLocaleDateString();
        const speed = document.getElementById('current-speed').textContent;
        const mapsLink = this.location ? 
            `https://maps.google.com/?q=${this.location.latitude},${this.location.longitude}` :
            'Location unavailable';
        
        return `🚨 *MADS - EMERGENCY ALERT* 🚨

*I've been in a bike accident!*

📍 *Location:* ${mapsLink}
📍 *Coordinates:* ${this.location?.latitude || 'N/A'}, ${this.location?.longitude || 'N/A'}
🕒 *Time:* ${time}
📅 *Date:* ${date}
📊 *Speed at impact:* ${speed} km/h

Please check on me immediately or call emergency services.

---
_Mobile Accident Detection System_ 🚲`;
    }
    
    async sendWhatsAppAlert(message) {
        if (!this.whatsapp.isConfigured) return false;
        
        const encodedMessage = encodeURIComponent(message);
        const url = `https://api.callmebot.com/whatsapp.php?phone=${this.whatsapp.phoneNumber}&text=${encodedMessage}&apikey=${this.whatsapp.apiKey}`;
        
        try {
            const response = await fetch(url);
            const text = await response.text();
            
            if (response.status === 200 && text.includes('Message sent')) {
                console.log('WhatsApp alert sent');
                return true;
            }
            return false;
        } catch (error) {
            console.error('WhatsApp send failed:', error);
            return false;
        }
    }
    
    checkWhatsAppConfig() {
        this.whatsapp.isConfigured = !!(this.whatsapp.apiKey && this.whatsapp.phoneNumber);
        
        const statusEl = document.getElementById('whatsapp-status');
        if (this.whatsapp.isConfigured) {
            statusEl.innerHTML = '<i class="fab fa-whatsapp" style="color: #25D366;"></i> WhatsApp: Configured';
            statusEl.classList.add('configured');
        } else {
            statusEl.innerHTML = '<i class="fab fa-whatsapp"></i> WhatsApp: Not configured';
        }
    }
    
    showWhatsAppModal() {
        document.getElementById('whatsapp-modal').style.display = 'flex';
        document.getElementById('whatsapp-apikey').value = this.whatsapp.apiKey;
        document.getElementById('whatsapp-phone').value = this.whatsapp.phoneNumber;
    }
    
    hideWhatsAppModal() {
        document.getElementById('whatsapp-modal').style.display = 'none';
    }
    
    saveWhatsAppConfig() {
        const apiKey = document.getElementById('whatsapp-apikey').value.trim();
        const phone = document.getElementById('whatsapp-phone').value.trim();
        
        if (!apiKey || !phone) {
            this.showToast('Please fill all fields', 'error');
            return;
        }
        
        this.whatsapp.apiKey = apiKey;
        this.whatsapp.phoneNumber = phone.replace(/\D/g, '');
        this.whatsapp.isConfigured = true;
        
        localStorage.setItem('mads_whatsapp_apikey', apiKey);
        localStorage.setItem('mads_whatsapp_phone', this.whatsapp.phoneNumber);
        
        this.hideWhatsAppModal();
        this.checkWhatsAppConfig();
        this.showToast('WhatsApp configured successfully!', 'success');
    }
    
    async testWhatsApp() {
        if (!this.whatsapp.isConfigured) {
            this.showToast('Please configure WhatsApp first', 'warning');
            this.showWhatsAppModal();
            return;
        }
        
        const testMessage = `🔧 *MADS Test Message* 🔧\n\nYour WhatsApp alert system is working correctly!`;
        
        this.showToast('Sending test message...', 'info');
        const sent = await this.sendWhatsAppAlert(testMessage);
        
        if (sent) {
            this.showToast('✅ Test message sent! Check your WhatsApp', 'success');
        } else {
            this.showToast('❌ Test failed. Check your API key', 'error');
        }
    }
    
    testImpact() {
        if (!this.isActive) {
            this.activateProtection('Manual test');
        }
        this.detectCrash('impact', this.threshold + 1);
    }
    
    testSpeedDrop() {
        if (!this.isActive) {
            this.activateProtection('Manual test');
        }
        this.detectCrash('speed_drop', this.speedDropThreshold + 5);
    }
    
    manualToggle() {
        if (this.isActive) {
            this.forceStop();
        } else {
            this.activateProtection('Manual activation');
        }
    }
    
    forceStop() {
        this.isActive = false;
        this.cancelDeactivation();
        this.deactivateProtection('Manually stopped');
        this.showToast('Protection stopped', 'info');
    }
    
    startBackgroundMonitoring() {
        if (!this.settings.backgroundMonitoring) return;
        
        // Monitor page visibility
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.isBackgroundMode = true;
                if (this.isActive) {
                    this.showBackgroundNotification('Protection Active', 'Monitoring in background');
                }
            } else {
                this.isBackgroundMode = false;
            }
        });
    }
    
    showBackgroundNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('MADS: ' + title, {
                body: body,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚲</text></svg>',
                tag: 'mads-background'
            });
        }
    }
    
    updateSpeedHistory() {
        const historyEl = document.getElementById('speed-history');
        if (this.speedHistory.length > 1) {
            const recent = this.speedHistory.slice(-5).map(s => s.speed.toFixed(1)).join(' → ');
            historyEl.innerHTML = `<small>Recent speeds: ${recent} km/h</small>`;
        }
    }
    
    async getCurrentLocation() {
        return new Promise((resolve) => {
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        this.location = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            speed: position.coords.speed || 0
                        };
                        resolve(this.location);
                    },
                    (error) => resolve(null),
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            } else {
                resolve(null);
            }
        });
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
            progress.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${message}</span>`;
        }
    }
    
    hideProgress() {
        const progress = document.getElementById('sms-progress');
        if (progress) progress.style.display = 'none';
    }
    
    updateThreshold(value) {
        this.threshold = parseFloat(value);
        document.getElementById('threshold-value').textContent = `${value}g`;
        document.getElementById('threshold-display').textContent = `${value}g`;
        this.saveSettings();
    }
    
    updateSpeedThreshold(value) {
        this.speedThreshold = parseInt(value);
        document.getElementById('speed-threshold-display').textContent = `${value} km/h`;
        this.saveSettings();
    }
    
    updateSpeedDropThreshold(value) {
        this.speedDropThreshold = parseInt(value);
        document.getElementById('speed-drop-display').textContent = `${value} km/h`;
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
            this.showToast('Please fill all fields', 'error');
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
        
        this.showToast(`${name} added to contacts`, 'success');
    }
    
    deleteContact(id) {
        this.contacts = this.contacts.filter(contact => contact.id !== id);
        this.saveContacts();
        this.renderContacts();
        this.showToast('Contact removed', 'info');
    }
    
    renderContacts() {
        const contactsList = document.getElementById('contacts-list');
        
        if (this.contacts.length === 0) {
            contactsList.innerHTML = `
                <div class="empty-contacts">
                    <i class="fas fa-user-plus"></i>
                    <p>No emergency contacts added</p>
                    <small>Add contacts who will receive WhatsApp alerts</small>
                </div>
            `;
            return;
        }
        
        contactsList.innerHTML = this.contacts.map(contact => `
            <div class="contact-item">
                <div class="contact-info">
                    <h4>${contact.name}</h4>
                    <p>${contact.phone}</p>
                </div>
                <button class="delete-contact" onclick="mads.deleteContact(${contact.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }
    
    updateUI() {
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => this.updateBatteryStatus(battery));
        }
    }
    
    updateBatteryStatus(battery) {
        const level = Math.round(battery.level * 100);
        document.getElementById('battery-status').innerHTML = `<i class="fas fa-battery-${this.getBatteryIcon(level)}"></i> ${level}%`;
    }
    
    getBatteryIcon(level) {
        if (level >= 90) return 'full';
        if (level >= 60) return 'three-quarters';
        if (level >= 30) return 'half';
        if (level >= 10) return 'quarter';
        return 'empty';
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
        toast.innerHTML = `<div class="toast-content"><i class="fas ${this.getToastIcon(type)}"></i><span>${message}</span></div>`;
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
    
    showNotification(title, message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`MADS: ${title}`, { body: message });
        }
    }
    
    setupPWA() {
        let deferredPrompt;
        const installBtn = document.getElementById('install-btn');
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.style.display = 'flex';
        });
        
        installBtn?.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') installBtn.style.display = 'none';
            deferredPrompt = null;
        });
        
        window.addEventListener('appinstalled', () => {
            installBtn.style.display = 'none';
            deferredPrompt = null;
        });
    }
    
    saveData() {
        const data = {
            contacts: this.contacts,
            settings: this.settings,
            threshold: this.threshold,
            speedThreshold: this.speedThreshold,
            speedDropThreshold: this.speedDropThreshold,
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
                this.speedThreshold = data.speedThreshold || 20;
                this.speedDropThreshold = data.speedDropThreshold || 25;
                this.countdownTime = data.countdownTime || 10;
                
                // Update UI
                document.getElementById('threshold').value = this.threshold;
                document.getElementById('threshold-display').textContent = this.threshold + 'g';
                document.getElementById('threshold-value').textContent = this.threshold + 'g';
                
                document.getElementById('speed-threshold').value = this.speedThreshold;
                document.getElementById('speed-threshold-display').textContent = this.speedThreshold + ' km/h';
                
                document.getElementById('speed-drop-threshold').value = this.speedDropThreshold;
                document.getElementById('speed-drop-display').textContent = this.speedDropThreshold + ' km/h';
                
                document.getElementById('countdown-time').value = this.countdownTime;
                document.getElementById('enable-sound').checked = this.settings.enableSound;
                document.getElementById('enable-vibration').checked = this.settings.enableVibration;
                document.getElementById('background-monitoring').checked = this.settings.backgroundMonitoring;
                
                this.renderContacts();
            } catch (e) {
                console.error('Failed to load data', e);
            }
        }
    }
    
    saveSettings() { this.saveData(); }
    saveContacts() { this.saveData(); }
}

// Initialize MADS
const mads = new MADS();
window.mads = mads;

// Add styles
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
            z-index: 10001;
            animation: slideUp 0.3s ease;
            display: none;
        }
        .mads-toast.success { background: var(--success); }
        .mads-toast.warning { background: var(--warning); }
        .mads-toast.error { background: var(--danger); }
        .toast-content { display: flex; align-items: center; gap: 10px; }
        @keyframes slideUp {
            from { opacity: 0; transform: translate(-50%, 20px); }
            to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes slideDown {
            from { opacity: 1; transform: translate(-50%, 0); }
            to { opacity: 0; transform: translate(-50%, 20px); }
        }
    `;
    document.head.appendChild(style);
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(console.log);
    }
});
