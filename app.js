class BikeAccidentDetector {
    constructor() {
        this.isActive = false;
        this.isDetecting = false;
        this.accelerationHistory = [];
        this.maxHistoryLength = 10;
        this.threshold = 3.5; // g-force threshold
        this.countdownTime = 10; // seconds
        this.countdownInterval = null;
        this.location = null;
        this.contacts = [];
        this.settings = {
            enableSound: true,
            enableVibration: true,
            autoSms: true // Global auto-SMS setting
        };
        this.smsQueue = [];
        this.isSendingSms = false;
        
        this.init();
    }
    
    async init() {
        // Check for PWA install
        this.setupPWA();
        
        // Load saved data
        this.loadData();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Check if running as native Android app (for future conversion)
        this.checkNativeAndroid();
        
        // Request permissions and start sensors
        await this.requestPermissions();
        
        // Update status display
        this.updateStatus();
    }
    
    checkNativeAndroid() {
        // This will be used when converted to Android app
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
        // Toggle system
        document.getElementById('toggle-system').addEventListener('click', () => this.toggleSystem());
        
        // Test alert
        document.getElementById('test-alert').addEventListener('click', () => this.testAlert());
        
        // Contact management
        document.getElementById('add-contact').addEventListener('click', () => this.showContactModal());
        document.getElementById('cancel-contact').addEventListener('click', () => this.hideContactModal());
        document.getElementById('save-contact').addEventListener('click', () => this.saveContact());
        
        // Countdown controls
        document.getElementById('cancel-alert').addEventListener('click', () => this.cancelAlert());
        document.getElementById('send-now').addEventListener('click', () => this.sendEmergencyAlert());
        
        // Settings
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
        
        // New auto-sms setting
        const autoSmsCheckbox = document.getElementById('auto-sms');
        if (autoSmsCheckbox) {
            autoSmsCheckbox.addEventListener('change', (e) => {
                this.settings.autoSms = e.target.checked;
                this.saveSettings();
                this.showToast(`Auto-SMS ${e.target.checked ? 'enabled' : 'disabled'}`);
            });
        }
        
        // Battery status
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                this.updateBatteryStatus(battery);
                battery.addEventListener('levelchange', () => this.updateBatteryStatus(battery));
            });
        }
    }
    
    async requestPermissions() {
        try {
            // Request notification permission
            if ('Notification' in window && Notification.permission !== 'granted') {
                await Notification.requestPermission();
            }
            
            // Request geolocation permission
            if ('geolocation' in navigator) {
                this.watchLocation();
            }
            
            // Check for DeviceMotion API
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
        
        // Calculate total g-force
        const gForce = Math.sqrt(
            Math.pow(acceleration.x || 0, 2) +
            Math.pow(acceleration.y || 0, 2) +
            Math.pow(acceleration.z || 0, 2)
        ) / 9.81;
        
        // Update display
        document.getElementById('acceleration').textContent = `${gForce.toFixed(2)} g`;
        
        // Add to history
        this.accelerationHistory.push(gForce);
        if (this.accelerationHistory.length > this.maxHistoryLength) {
            this.accelerationHistory.shift();
        }
        
        // Calculate jerk (rate of change of acceleration)
        if (this.accelerationHistory.length >= 2) {
            const jerk = Math.abs(this.accelerationHistory[this.accelerationHistory.length - 1] - 
                                this.accelerationHistory[this.accelerationHistory.length - 2]);
            document.getElementById('last-jerk').textContent = `${jerk.toFixed(2)} g/s`;
            
            // Check for sudden impact (high jerk + high g-force)
            if (this.isActive && !this.isDetecting && 
                gForce > this.threshold && jerk > 1.5) {
                this.detectImpact(gForce);
            }
        }
        
        // Update progress bar
        const progress = Math.min((gForce / this.threshold) * 100, 100);
        document.getElementById('impact-progress').style.width = `${progress}%`;
        
        // Update impact force display
        document.getElementById('impact-force').textContent = `${gForce.toFixed(2)} g`;
        
        // Change color based on severity
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
        
        // Trigger emergency alert
        this.triggerEmergencyAlert(gForce);
    }
    
    async triggerEmergencyAlert(gForce) {
        console.log(`Impact detected: ${gForce.toFixed(2)}g`);
        
        // Update UI for emergency
        document.getElementById('system-status').innerHTML = `
            <div class="indicator alert"></div>
            <span>ALERT TRIGGERED!</span>
        `;
        
        // Show countdown overlay
        this.showCountdownOverlay();
        
        // Start countdown
        let timeLeft = this.countdownTime;
        document.getElementById('countdown-timer').textContent = timeLeft;
        
        // Update location in overlay
        this.updateLocationInfo();
        
        // Start alarm and vibration
        this.startAlarm();
        
        // Start countdown
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
        
        // Show confirmation
        this.showNotification('Alert cancelled', 'System is back to monitoring');
    }
    
    async sendEmergencyAlert() {
        clearInterval(this.countdownInterval);
        this.stopAlarm();
        
        // Show sending progress
        this.showSmsProgress();
        
        // Get current location if not available
        if (!this.location) {
            await this.getCurrentLocation();
        }
        
        // Update SMS status
        this.updateSmsStatus('sending');
        
        // Send alerts to all contacts
        let successCount = 0;
        let manualCount = 0;
        
        for (const contact of this.contacts) {
            const method = contact.method || (this.settings.autoSms ? 'auto' : 'manual');
            const sent = await this.sendAlertToContact(contact, method);
            
            if (sent) {
                if (method === 'auto') {
                    successCount++;
                } else {
                    manualCount++;
                }
            }
        }
        
        // Hide progress
        this.hideSmsProgress();
        
        // Update SMS status
        if (successCount > 0) {
            this.updateSmsStatus('success');
            this.showToast(`${successCount} SMS sent automatically, ${manualCount} opened for manual send`);
        } else if (manualCount > 0) {
            this.updateSmsStatus('warning');
            this.showToast(`Opened SMS app for ${manualCount} contacts. Please tap Send.`);
        } else {
            this.updateSmsStatus('error');
            this.showToast('No contacts to notify');
        }
        
        // Hide overlay after sending
        this.hideCountdownOverlay();
        
        // Reset system
        this.isDetecting = false;
        this.updateStatus();
        console.log("Contacts:", this.contacts);
         {

    this.loadData(); // reload contacts from storage

    console.log("Contacts:", this.contacts);

    if (!this.contacts || this.contacts.length === 0) {
        console.warn("No contacts saved");
        return;
    }

    if (!this.location) {
        await this.getCurrentLocation();
    }

    for (const contact of this.contacts) {
        await this.sendAlertToContact(contact);
        await this.delay(500);
    }

    this.isDetecting = false;
}
    }
    
    async sendAlertToContact(contact, method = 'auto') {
        const message = this.createEmergencyMessage(contact.name);
        const phoneNumber = contact.phone.replace(/\D/g, '');
        
        try {
            if (method === 'auto') {
                // Try native Android first (for future conversion)
                if (this.isNativeAndroid && typeof Android !== 'undefined' && Android.sendSms) {
                    const result = Android.sendSms(phoneNumber, message);
                    return result === 'success';
                }
                
                // For web app, try SMS URI with auto-send (some browsers support)
                const smsUri = `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
                
                // Try to send via SMS API if available
                const sentViaSmsApi = await this.trySendViaSmsApi(phoneNumber, message);
                if (sentViaSmsApi) {
                    return true;
                }
                
                // Fallback to opening SMS app (user must press send)
                window.location.href = smsUri;
                return false;
            } else {
                // Manual method - always open SMS app
                const smsUri = `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
                window.open(smsUri, '_blank');
                return false;
            }
        } catch (error) {
            console.error('SMS sending failed:', error);
            
            // Fallback to manual SMS
            const smsUri = `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
            window.open(smsUri, '_blank');
            return false;
        }
    }
    
    async trySendViaSmsApi(phoneNumber, message) {
        // This is where you'd integrate with SMS gateway services
        // For now, return false to use fallback
        return false;
    }
    
    createEmergencyMessage(contactName) {
        const time = new Date().toLocaleTimeString();
        const date = new Date().toLocaleDateString();
        const locationLink = this.location ? 
            `https://maps.google.com/?q=${this.location.latitude},${this.location.longitude}` :
            'Location unavailable';
        
        return `🚨 EMERGENCY - Bike Accident 🚨

I've been in an accident and need immediate assistance!

📍 Location: ${locationLink}
🕒 Time: ${time}
📅 Date: ${date}

Coordinates: ${this.location?.latitude || 'N/A'}, ${this.location?.longitude || 'N/A'}
Accuracy: ${this.location?.accuracy ? Math.round(this.location.accuracy) + 'm' : 'N/A'}

Please check on me immediately or call emergency services.

- BikeGuard Automatic Alert System`;
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
            smsStatus.className = ''; // Remove previous classes
            smsStatus.classList.add('status-item');
            
            switch(status) {
                case 'sending':
                    smsStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SMS: Sending...';
                    smsStatus.classList.add('sending');
                    break;
                case 'success':
                    smsStatus.innerHTML = '<i class="fas fa-check-circle"></i> SMS: Sent';
                    smsStatus.classList.add('success');
                    break;
                case 'warning':
                    smsStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> SMS: Manual send required';
                    smsStatus.classList.add('warning');
                    break;
                case 'error':
                    smsStatus.innerHTML = '<i class="fas fa-times-circle"></i> SMS: Failed';
                    smsStatus.classList.add('error');
                    break;
                default:
                    smsStatus.innerHTML = '<i class="fas fa-sms"></i> SMS: Ready';
                    smsStatus.classList.add('ready');
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
        
        // Simulate an impact
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
        
        // Reset contact method to default
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
        
        // Basic phone validation
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
        
        this.showNotification('Contact saved', `${name} added to emergency contacts (${method === 'auto' ? 'Auto SMS' : 'Manual SMS'})`);
    }
    
    deleteContact(id) {
        if (confirm('Are you sure you want to remove this contact?')) {
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
                    <p>No emergency contacts added yet</p>
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
                            ${(contact.method || (this.settings.autoSms ? 'auto' : 'manual')) === 'auto' ? '⚡ Auto' : '✎ Manual'}
                        </span>
                    </h4>
                    <p>${contact.phone}</p>
                    <small class="sms-method-icon ${contact.method || 'auto'}">
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
        // Update battery status
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                this.updateBatteryStatus(battery);
            });
        }
        
        // Update SMS status to ready
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
        // Web notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚲</text></svg>',
                badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚲</text></svg>'
            });
        }
        
        // In-app toast
        this.showToast(message, title);
    }
    
    showToast(message, title = 'BikeGuard') {
        // Check if toast container exists
        let toast = document.getElementById('sms-toast');
        
        if (!toast) {
            // Create toast container if it doesn't exist
            toast = document.createElement('div');
            toast.id = 'sms-toast';
            toast.className = 'sms-toast';
            document.body.appendChild(toast);
        }
        
        // Update toast content
        toast.innerHTML = `
            <div class="sms-toast-content">
                <i class="fas fa-info-circle"></i>
                <div>
                    <strong>${title}</strong><br>
                    <span>${message}</span>
                </div>
            </div>
        `;
        
        // Show toast
        toast.style.display = 'block';
        
        // Hide after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideDown 0.3s ease';
            setTimeout(() => {
                toast.style.display = 'none';
                toast.style.animation = '';
            }, 300);
        }, 3000);
    }
    
    saveData() {
        const data = {
            contacts: this.contacts,
            settings: this.settings,
            threshold: this.threshold,
            countdownTime: this.countdownTime
        };
        localStorage.setItem('bikeGuard', JSON.stringify(data));
    }
    
   loadData() {
    const saved = localStorage.getItem('bikeGuard');

    if (!saved) {
        this.contacts = [];
        return;
    }

    try {
        const data = JSON.parse(saved);

        this.contacts = data.contacts || [];

        console.log("Loaded contacts:", this.contacts);

    } catch (e) {
        console.error("Failed to load contacts", e);
        this.contacts = [];
    }
}
    
    saveSettings() {
        this.saveData();
    }
    
    saveContacts() {
        this.saveData();
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.bikeGuard = new BikeAccidentDetector();
    
    // Add CSS for toast animations if not already present
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
    
    // Service Worker registration for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(error => {
                console.log('Service Worker registration failed:', error);
            });
        });
    }
});
