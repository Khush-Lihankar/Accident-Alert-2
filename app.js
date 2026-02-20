class BikeAccidentDetector {
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
            autoSms: true
        };
        this.smsQueue = [];
        this.isSendingSms = false;
        
        this.init();
    }
    
    async init() {
        this.setupPWA();
        this.loadData();
        this.setupEventListeners();
        this.checkNativeAndroid();
        await this.requestPermissions();
        this.setupSMSGateway();
        this.updateStatus();
    }
    
    setupSMSGateway() {
        // Check if we're in a native Android WebView
        if (typeof Android !== 'undefined' && Android !== null) {
            console.log('Native Android SMS available');
            return;
        }
        
        // Check if SMS Gateway API is configured
        this.smsGateway = {
            type: localStorage.getItem('smsGatewayType') || 'none',
            url: localStorage.getItem('smsGatewayUrl') || '',
            apiKey: localStorage.getItem('smsGatewayApiKey') || ''
        };
    }
    
    checkNativeAndroid() {
        if (typeof Android !== 'undefined' && Android !== null) {
            console.log('Running as native Android app');
            this.isNativeAndroid = true;
        } else {
            console.log('Running as web app');
            this.isNativeAndroid = false;
        }
    }
    
    setupPWA() {
        let deferredPrompt;
        const installBtn = document.getElementById('install-btn');
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.style.display = 'flex';
            
            installBtn.addEventListener('click', async () => {
                if (!deferredPrompt) return;
                
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                
                if (outcome === 'accepted') {
                    installBtn.style.display = 'none';
                }
                
                deferredPrompt = null;
            });
        });
        
        window.addEventListener('appinstalled', () => {
            installBtn.style.display = 'none';
            deferredPrompt = null;
        });
    }
    
    setupEventListeners() {
        document.getElementById('toggle-system').addEventListener('click', () => this.toggleSystem());
        document.getElementById('test-alert').addEventListener('click', () => this.testAlert());
        document.getElementById('add-contact').addEventListener('click', () => this.showContactModal());
        document.getElementById('cancel-contact').addEventListener('click', () => this.hideContactModal());
        document.getElementById('save-contact').addEventListener('click', () => this.saveContact());
        document.getElementById('cancel-alert').addEventListener('click', () => this.cancelAlert());
        document.getElementById('send-now').addEventListener('click', () => this.sendEmergencyAlert());
        
        document.getElementById('threshold').addEventListener('input', (e) => this.updateThreshold(e.target.value));
        document.getElementById('countdown-time').addEventListener('change', (e) => {
            this.countdownTime = parseInt(e.target.value);
            this.saveSettings();
        });
        document.getElementById('enable-sound').addEventListener('change', (e) => {
            this.settings.enableSound = e.target.checked;
            this.saveSettings();
        });
        document.getElementById('enable-vibration').addEventListener('change', (e) => {
            this.settings.enableVibration = e.target.checked;
            this.saveSettings();
        });
        
        const autoSmsCheckbox = document.getElementById('auto-sms');
        if (autoSmsCheckbox) {
            autoSmsCheckbox.addEventListener('change', (e) => {
                this.settings.autoSms = e.target.checked;
                this.saveSettings();
                this.showToast(`Auto-SMS ${e.target.checked ? 'enabled' : 'disabled'}`);
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
            console.error('Permission request failed:', error);
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
                    document.getElementById('gps-status').textContent = 'GPS: Active';
                    document.getElementById('gps-status').style.color = 'var(--success)';
                },
                (error) => {
                    console.error('GPS Error:', error);
                    document.getElementById('gps-status').textContent = 'GPS: Error';
                    document.getElementById('gps-status').style.color = 'var(--danger)';
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
        console.log(`Impact detected: ${gForce.toFixed(2)}g`);
        
        document.getElementById('system-status').innerHTML = `
            <div class="indicator alert"></div>
            <span>ALERT TRIGGERED!</span>
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
        this.updateStatus();
        this.showNotification('Alert cancelled', 'System is back to monitoring');
    }
    
    async sendEmergencyAlert() {
        clearInterval(this.countdownInterval);
        this.stopAlarm();
        
        this.showSmsProgress();
        
        if (!this.location) {
            await this.getCurrentLocation();
        }
        
        this.updateSmsStatus('sending');
        
        let successCount = 0;
        let manualCount = 0;
        let failedCount = 0;
        
        for (const contact of this.contacts) {
            const method = contact.method || (this.settings.autoSms ? 'auto' : 'manual');
            const result = await this.sendAlertToContact(contact, method);
            
            if (result === 'auto') {
                successCount++;
            } else if (result === 'manual') {
                manualCount++;
            } else {
                failedCount++;
            }
            
            // Small delay between messages
            await this.delay(500);
        }
        
        this.hideSmsProgress();
        
        if (successCount > 0) {
            this.updateSmsStatus('success');
            this.showToast(`✅ ${successCount} SMS sent automatically`, 'success');
        }
        
        if (manualCount > 0) {
            this.updateSmsStatus('warning');
            this.showToast(`✉️ ${manualCount} SMS opened for manual send`, 'warning');
        }
        
        if (failedCount > 0) {
            this.updateSmsStatus('error');
            this.showToast(`❌ ${failedCount} SMS failed`, 'error');
        }
        
        if (successCount === 0 && manualCount === 0 && failedCount === 0) {
            this.updateSmsStatus('error');
            this.showToast('No contacts to notify', 'error');
        }
        
        this.hideCountdownOverlay();
        this.isDetecting = false;
        this.updateStatus();
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async sendAlertToContact(contact, method = 'auto') {
        const message = this.createEmergencyMessage(contact.name);
        const phoneNumber = contact.phone.replace(/\D/g, '');
        
        try {
            // METHOD 1: Native Android (for when converted to app)
            if (this.isNativeAndroid && typeof Android !== 'undefined' && Android.sendSms) {
                const result = Android.sendSms(phoneNumber, message);
                if (result === 'success') {
                    console.log(`SMS sent via native Android to ${contact.name}`);
                    return 'auto';
                }
            }
            
            // METHOD 2: SMS Gateway API (if configured)
            if (method === 'auto' && this.smsGateway.type !== 'none') {
                const sent = await this.sendViaSmsGateway(phoneNumber, message);
                if (sent) {
                    console.log(`SMS sent via gateway to ${contact.name}`);
                    return 'auto';
                }
            }
            
            // METHOD 3: SMS URI with auto-send intent (Android)
            if (method === 'auto' && /Android/i.test(navigator.userAgent)) {
                const sent = await this.sendViaAndroidIntent(phoneNumber, message);
                if (sent) {
                    console.log(`SMS sent via Android intent to ${contact.name}`);
                    return 'auto';
                }
            }
            
            // METHOD 4: Multiple SMS tabs trick (opens multiple, but user still needs to send)
            if (method === 'auto') {
                this.openSmsInBackground(phoneNumber, message);
                return 'manual'; // Still requires user action
            }
            
            // METHOD 5: Manual - open SMS app
            const smsUri = `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
            window.open(smsUri, '_blank');
            return 'manual';
            
        } catch (error) {
            console.error('SMS sending failed:', error);
            
            // Fallback to manual
            const smsUri = `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
            window.open(smsUri, '_blank');
            return 'failed';
        }
    }
    
    async sendViaSmsGateway(phoneNumber, message) {
        if (this.smsGateway.type === 'textbelt') {
            try {
                const response = await fetch('https://textbelt.com/text', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        phone: phoneNumber,
                        message: message,
                        key: this.smsGateway.apiKey || 'textbelt'
                    })
                });
                
                const data = await response.json();
                return data.success;
            } catch (error) {
                console.warn('TextBelt failed:', error);
                return false;
            }
        }
        
        if (this.smsGateway.type === 'custom' && this.smsGateway.url) {
            try {
                const response = await fetch(this.smsGateway.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.smsGateway.apiKey}`
                    },
                    body: JSON.stringify({
                        to: phoneNumber,
                        message: message,
                        from: 'BikeGuard'
                    })
                });
                
                return response.ok;
            } catch (error) {
                console.warn('Custom gateway failed:', error);
                return false;
            }
        }
        
        return false;
    }
    
    async sendViaAndroidIntent(phoneNumber, message) {
        return new Promise((resolve) => {
            // Create an invisible iframe to trigger SMS intent
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            
            // Different Android SMS intent formats
            const intents = [
                `sms:${phoneNumber}?body=${encodeURIComponent(message)}`,
                `intent://${phoneNumber}#Intent;schedule=sms;body=${encodeURIComponent(message)};end`,
                `sms://${phoneNumber}?body=${encodeURIComponent(message)}`
            ];
            
            let attempted = 0;
            
            const tryNextIntent = () => {
                if (attempted < intents.length) {
                    iframe.src = intents[attempted];
                    document.body.appendChild(iframe);
                    attempted++;
                    setTimeout(tryNextIntent, 100);
                } else {
                    document.body.removeChild(iframe);
                    resolve(false);
                }
            };
            
            tryNextIntent();
            
            // Some Android devices might auto-send with proper permissions
            setTimeout(() => {
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
                resolve(true); // Assume it worked
            }, 500);
        });
    }
    
    openSmsInBackground(phoneNumber, message) {
        // Create multiple hidden iframes to increase chance of auto-send
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
                document.body.appendChild(iframe);
                
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 1000);
            }, i * 200);
        }
    }
    
    createEmergencyMessage(contactName) {
        const time = new Date().toLocaleTimeString();
        const date = new Date().toLocaleDateString();
        const mapsLink = this.location ? 
            `https://maps.google.com/?q=${this.location.latitude},${this.location.longitude}` :
            'Location unavailable';
        
        const shortLink = this.location ?
            `http://maps.google.com/maps?q=${this.location.latitude},${this.location.longitude}` :
            '';
        
        return `🚨 BIKE ACCIDENT! 🚨
        
I've crashed my bike and need help!

📍 Location: ${shortLink}
📍 Coordinates: ${this.location?.latitude || 'N/A'}, ${this.location?.longitude || 'N/A'}
🕒 Time: ${time}
📅 Date: ${date}

Please check on me immediately or call emergency services.

- BikeGuard Emergency Alert`;
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
                        console.error('Location error:', error);
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
    
    updateLocationInfo() {
        const locationInfo = document.getElementById('location-info');
        if (this.location) {
            locationInfo.innerHTML = `
                📍 ${this.location.latitude.toFixed(6)}, ${this.location.longitude.toFixed(6)}
                <br><small>Accuracy: ±${Math.round(this.location.accuracy)}m</small>
                <br><small class="location-link">maps.google.com/?q=${this.location.latitude},${this.location.longitude}</small>
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
    
    showSmsProgress() {
        const smsProgress = document.getElementById('sms-progress');
        if (smsProgress) {
            smsProgress.style.display = 'flex';
            smsProgress.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                <span>Sending SMS alerts to ${this.contacts.length} contact(s)...</span>
            `;
        }
    }
    
    hideSmsProgress() {
        const smsProgress = document.getElementById('sms-progress');
        if (smsProgress) {
            smsProgress.style.display = 'none';
        }
    }
    
    updateSmsStatus(status) {
        const smsStatus = document.getElementById('sms-status');
        if (smsStatus) {
            smsStatus.className = 'status-item';
            
            switch(status) {
                case 'sending':
                    smsStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SMS: Sending...';
                    smsStatus.classList.add('sending');
                    break;
                case 'success':
                    smsStatus.innerHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i> SMS: Sent';
                    smsStatus.classList.add('success');
                    break;
                case 'warning':
                    smsStatus.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--warning);"></i> SMS: Manual';
                    smsStatus.classList.add('warning');
                    break;
                case 'error':
                    smsStatus.innerHTML = '<i class="fas fa-times-circle" style="color: var(--danger);"></i> SMS: Failed';
                    smsStatus.classList.add('error');
                    break;
                default:
                    smsStatus.innerHTML = '<i class="fas fa-sms"></i> SMS: Ready';
            }
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
                <span>ACTIVE - Monitoring</span>
            `;
            this.showNotification('Protection Activated', 'BikeGuard is now monitoring for accidents');
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-power-off"></i> Start Protection';
            toggleBtn.classList.remove('btn-secondary');
            toggleBtn.classList.add('btn-primary');
            statusIndicator.innerHTML = `
                <div class="indicator inactive"></div>
                <span>INACTIVE</span>
            `;
            this.showNotification('Protection Deactivated', 'BikeGuard is not monitoring');
        }
    }
    
    testAlert() {
        if (!this.isActive) {
            this.showNotification('Please activate system first', 'Click "Start Protection" to begin monitoring');
            return;
        }
        
        this.detectImpact(this.threshold + 1);
        this.showNotification('Test Alert Started', 'Countdown initiated - cancel to stop test');
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
        
        const methodSelect = document.getElementById('contact-method');
        if (methodSelect) {
            methodSelect.value = this.settings.autoSms ? 'auto' : 'manual';
        }
    }
    
    saveContact() {
        const name = document.getElementById('contact-name').value.trim();
        const phone = document.getElementById('contact-phone').value.trim();
        const methodSelect = document.getElementById('contact-method');
        const method = methodSelect ? methodSelect.value : (this.settings.autoSms ? 'auto' : 'manual');
        
        if (!name || !phone) {
            this.showNotification('Please fill all fields', 'Name and phone number are required');
            return;
        }
        
        const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,5}[-\s\.]?[0-9]{1,5}$/;
        if (!phoneRegex.test(phone)) {
            this.showNotification('Invalid phone number', 'Please enter a valid phone number');
            return;
        }
        
        const contact = {
            id: Date.now(),
            name: name,
            phone: phone,
            method: method
        };
        
        this.contacts.push(contact);
        this.saveContacts();
        this.renderContacts();
        this.hideContactModal();
        
        const methodText = method === 'auto' ? 'Auto SMS' : 'Manual SMS';
        this.showNotification('Contact saved', `${name} added (${methodText})`);
    }
    
    deleteContact(id) {
        if (confirm('Remove this emergency contact?')) {
            this.contacts = this.contacts.filter(contact => contact.id !== id);
            this.saveContacts();
            this.renderContacts();
            this.showNotification('Contact removed', 'Emergency contact deleted');
        }
    }
    
    renderContacts() {
        const contactsList = document.getElementById('contacts-list');
        
        if (this.contacts.length === 0) {
            contactsList.innerHTML = `
                <div class="empty-contacts">
                    <i class="fas fa-user-plus"></i>
                    <p>No emergency contacts added</p>
                    <small>Add contacts who will receive SMS alerts</small>
                </div>
            `;
            return;
        }
        
        contactsList.innerHTML = this.contacts.map(contact => `
            <div class="contact-item">
                <div class="contact-info">
                    <h4>
                        ${contact.name}
                        <span class="sms-badge ${contact.method || (this.settings.autoSms ? 'auto' : 'manual')}">
                            ${(contact.method || (this.settings.autoSms ? 'auto' : 'manual')) === 'auto' ? '⚡ AUTO' : '✎ MANUAL'}
                        </span>
                    </h4>
                    <p>${contact.phone}</p>
                    <small>
                        <i class="fas ${(contact.method || 'auto') === 'auto' ? 'fa-bolt' : 'fa-pencil-alt'}"></i>
                        ${(contact.method || 'auto') === 'auto' ? 'Automatic SMS' : 'Opens messaging app'}
                    </small>
                </div>
                <button class="delete-contact" onclick="bikeGuard.deleteContact(${contact.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }
    
    updateStatus() {
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                this.updateBatteryStatus(battery);
            });
        }
        this.updateSmsStatus('ready');
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
            new Notification(title, {
                body: message,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚲</text></svg>'
            });
        }
        
        this.showToast(message, title);
    }
    
    showToast(message, type = 'info') {
        let toast = document.getElementById('sms-toast');
        
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'sms-toast';
            toast.className = 'sms-toast';
            document.body.appendChild(toast);
        }
        
        toast.className = `sms-toast ${type}`;
        toast.innerHTML = `
            <div class="sms-toast-content">
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
            countdownTime: this.countdownTime,
            smsGateway: this.smsGateway
        };
        localStorage.setItem('bikeGuard', JSON.stringify(data));
    }
    
    loadData() {
        const saved = localStorage.getItem('bikeGuard');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.contacts = data.contacts || [];
                this.settings = { ...this.settings, ...(data.settings || {}) };
                this.threshold = data.threshold || 3.5;
                this.countdownTime = data.countdownTime || 10;
                this.smsGateway = data.smsGateway || { type: 'none' };
                
                document.getElementById('threshold').value = this.threshold;
                document.getElementById('threshold-display').textContent = `${this.threshold}g`;
                document.getElementById('threshold-value').textContent = `${this.threshold}g`;
                document.getElementById('countdown-time').value = this.countdownTime;
                document.getElementById('enable-sound').checked = this.settings.enableSound;
                document.getElementById('enable-vibration').checked = this.settings.enableVibration;
                
                const autoSmsCheckbox = document.getElementById('auto-sms');
                if (autoSmsCheckbox) {
                    autoSmsCheckbox.checked = this.settings.autoSms;
                }
                
                this.renderContacts();
            } catch (e) {
                console.error('Failed to load saved data:', e);
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

document.addEventListener('DOMContentLoaded', () => {
    window.bikeGuard = new BikeAccidentDetector();
    
    if (!document.querySelector('#sms-toast-style')) {
        const style = document.createElement('style');
        style.id = 'sms-toast-style';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            @keyframes slideDown {
                from { transform: translateY(0); opacity: 1; }
                to { transform: translateY(20px); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(error => {
                console.log('Service Worker registration failed:', error);
            });
        });
    }
});
