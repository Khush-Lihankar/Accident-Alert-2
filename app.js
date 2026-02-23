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
            speedUnit: 'kmh' // 'kmh' or 'mph'
        };
        
        // Speed tracking properties
        this.speedHistory = [];
        this.maxSpeedHistory = 30; // Keep last 30 readings
        this.currentSpeed = 0;
        this.maxSpeed = 0;
        this.lastPosition = null;
        this.lastSpeedTimestamp = null;
        this.speedUpdateInterval = null;
        
        this.init();
    }
    
    async init() {
        // Check for PWA install
        this.setupPWA();
        
        // Load saved data
        this.loadData();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Request permissions and start sensors
        await this.requestPermissions();
        
        // Start speed tracking
        this.startSpeedTracking();
        
        // Update status display
        this.updateStatus();
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
        document.getElementById('countdown-time').addEventListener('change', (e) => this.countdownTime = parseInt(e.target.value));
        document.getElementById('enable-sound').addEventListener('change', (e) => this.settings.enableSound = e.target.checked);
        document.getElementById('enable-vibration').addEventListener('change', (e) => this.settings.enableVibration = e.target.checked);
        document.getElementById('speed-unit').addEventListener('change', (e) => {
            this.settings.speedUnit = e.target.value;
            this.updateSpeedDisplay();
            this.saveSettings();
        });
        
        // Install button
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
    
    startSpeedTracking() {
        // Update speed display every second
        this.speedUpdateInterval = setInterval(() => {
            this.updateSpeedDisplay();
        }, 1000);
    }
    
    watchLocation() {
        if ('geolocation' in navigator) {
            navigator.geolocation.watchPosition(
                (position) => {
                    this.handleLocationUpdate(position);
                },
                (error) => {
                    console.error('GPS Error:', error);
                    document.getElementById('gps-status').textContent = 'GPS: Error';
                    document.getElementById('speed-value').innerHTML = '0 <span class="unit">km/h</span>';
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: 5000
                }
            );
        }
    }
    
    handleLocationUpdate(position) {
        // Update location
        this.location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed, // Speed in m/s
            timestamp: position.timestamp
        };
        
        document.getElementById('gps-status').textContent = 'GPS: Active';
        
        // Calculate speed from GPS if available
        if (position.coords.speed !== null && position.coords.speed !== undefined) {
            // Convert m/s to km/h or mph
            let speed = position.coords.speed * 3.6; // km/h
            
            // Update current speed
            this.currentSpeed = speed;
            
            // Track max speed
            if (speed > this.maxSpeed) {
                this.maxSpeed = speed;
            }
            
            // Add to history
            this.speedHistory.push({
                speed: speed,
                timestamp: position.timestamp
            });
            
            // Keep history limited
            if (this.speedHistory.length > this.maxSpeedHistory) {
                this.speedHistory.shift();
            }
            
            // Update display
            this.updateSpeedDisplay();
        } else {
            // Fallback to manual speed calculation if GPS speed not available
            this.calculateSpeedFromPosition(position);
        }
    }
    
    calculateSpeedFromPosition(position) {
        if (this.lastPosition && this.lastSpeedTimestamp) {
            const timeDiff = (position.timestamp - this.lastSpeedTimestamp) / 1000; // in seconds
            
            if (timeDiff > 0) {
                // Calculate distance using Haversine formula
                const distance = this.calculateDistance(
                    this.lastPosition.coords.latitude,
                    this.lastPosition.coords.longitude,
                    position.coords.latitude,
                    position.coords.longitude
                );
                
                // Calculate speed in km/h
                const speed = (distance / timeDiff) * 3.6;
                
                // Filter out unrealistic speeds (e.g., GPS noise when stationary)
                if (speed < 200) { // Max reasonable bike speed
                    this.currentSpeed = speed;
                    
                    if (speed > this.maxSpeed) {
                        this.maxSpeed = speed;
                    }
                    
                    this.speedHistory.push({
                        speed: speed,
                        timestamp: position.timestamp
                    });
                    
                    if (this.speedHistory.length > this.maxSpeedHistory) {
                        this.speedHistory.shift();
                    }
                    
                    this.updateSpeedDisplay();
                }
            }
        }
        
        this.lastPosition = position;
        this.lastSpeedTimestamp = position.timestamp;
    }
    
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c; // Distance in meters
    }
    
    updateSpeedDisplay() {
        const speedElement = document.getElementById('speed-value');
        const maxSpeedElement = document.getElementById('max-speed');
        
        if (speedElement) {
            let displaySpeed = this.currentSpeed;
            let unit = 'km/h';
            
            // Convert to mph if selected
            if (this.settings.speedUnit === 'mph') {
                displaySpeed = this.currentSpeed * 0.621371;
                unit = 'mph';
            }
            
            speedElement.innerHTML = `${Math.round(displaySpeed)} <span class="unit">${unit}</span>`;
            
            // Change color based on speed
            if (this.currentSpeed > 80) {
                speedElement.style.color = 'var(--primary)';
            } else if (this.currentSpeed > 50) {
                speedElement.style.color = 'var(--warning)';
            } else {
                speedElement.style.color = 'var(--safe)';
            }
        }
        
        if (maxSpeedElement) {
            let displayMaxSpeed = this.maxSpeed;
            let unit = 'km/h';
            
            if (this.settings.speedUnit === 'mph') {
                displayMaxSpeed = this.maxSpeed * 0.621371;
                unit = 'mph';
            }
            
            maxSpeedElement.innerHTML = `${Math.round(displayMaxSpeed)} <span class="unit">${unit}</span>`;
        }
        
        // Update speed trend
        this.updateSpeedTrend();
    }
    
    updateSpeedTrend() {
        const trendElement = document.getElementById('speed-trend');
        if (!trendElement || this.speedHistory.length < 2) return;
        
        const lastTwo = this.speedHistory.slice(-2);
        const speedDiff = lastTwo[1].speed - lastTwo[0].speed;
        
        if (Math.abs(speedDiff) < 1) {
            trendElement.innerHTML = '<i class="fas fa-minus"></i> Stable';
            trendElement.style.color = 'var(--text-secondary)';
        } else if (speedDiff > 0) {
            trendElement.innerHTML = '<i class="fas fa-arrow-up"></i> Accelerating';
            trendElement.style.color = 'var(--warning)';
        } else {
            trendElement.innerHTML = '<i class="fas fa-arrow-down"></i> Decelerating';
            trendElement.style.color = 'var(--safe)';
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
            // Adjust threshold based on speed - higher speed = more sensitive
            let speedAdjustedThreshold = this.threshold;
            if (this.currentSpeed > 60) {
                speedAdjustedThreshold = this.threshold * 0.8; // More sensitive at high speed
            } else if (this.currentSpeed > 30) {
                speedAdjustedThreshold = this.threshold * 0.9;
            }
            
            if (this.isActive && !this.isDetecting && 
                gForce > speedAdjustedThreshold && jerk > 1.5) {
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
        
        // Log speed at impact
        console.log(`Impact detected at speed: ${this.currentSpeed.toFixed(1)} km/h`);
        
        // Trigger emergency alert
        this.triggerEmergencyAlert(gForce);
    }
    
    async triggerEmergencyAlert(gForce) {
        console.log(`Impact detected: ${gForce.toFixed(2)}g at ${this.currentSpeed.toFixed(1)} km/h`);
        
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
        
        // Update location and speed info in overlay
        this.updateEmergencyInfo();
        
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
    
    updateEmergencyInfo() {
        const locationInfo = document.getElementById('location-info');
        const speedInfo = document.getElementById('speed-info');
        
        if (this.location) {
            locationInfo.innerHTML = `
                <i class="fas fa-map-marker-alt"></i>
                ${this.location.latitude.toFixed(6)}, ${this.location.longitude.toFixed(6)}
                <br><small>Accuracy: ${Math.round(this.location.accuracy)} meters</small>
            `;
        } else {
            locationInfo.innerHTML = '<i class="fas fa-map-marker-alt"></i> Getting location...';
            this.getCurrentLocation().then(() => {
                if (this.location) {
                    locationInfo.innerHTML = `
                        <i class="fas fa-map-marker-alt"></i>
                        ${this.location.latitude.toFixed(6)}, ${this.location.longitude.toFixed(6)}
                        <br><small>Accuracy: ${Math.round(this.location.accuracy)} meters</small>
                    `;
                }
            });
        }
        
        if (speedInfo) {
            let displaySpeed = this.currentSpeed;
            let unit = 'km/h';
            
            if (this.settings.speedUnit === 'mph') {
                displaySpeed = this.currentSpeed * 0.621371;
                unit = 'mph';
            }
            
            speedInfo.innerHTML = `
                <i class="fas fa-tachometer-alt"></i>
                Speed at impact: ${Math.round(displaySpeed)} ${unit}
            `;
        }
    }
    
    showCountdownOverlay() {
        document.getElementById('countdown-overlay').style.display = 'flex';
        document.body.classList.add('vibrate');
        this.updateEmergencyInfo();
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
        this.hideCountdownOverlay();
        
        // Get current location if not available
        if (!this.location) {
            await this.getCurrentLocation();
        }
        
        // Send alerts to all contacts
        for (const contact of this.contacts) {
            await this.sendAlertToContact(contact);
        }
        
        // Reset system
        this.isDetecting = false;
        this.updateStatus();
        
        // Show confirmation
        this.showNotification('Emergency alert sent!', 'Your contacts have been notified');
    }
    
    async sendAlertToContact(contact) {
        const message = this.createEmergencyMessage(contact.name);
        const phoneNumber = contact.phone.replace(/\D/g, '');
        
        // Try WhatsApp
        const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
        
        // Open WhatsApp in new tab
        window.open(whatsappUrl, '_blank');
        
        // Fallback to SMS if WhatsApp fails
        setTimeout(() => {
            if ('sms' in navigator) {
                navigator.ms.sendSms(phoneNumber, message);
            }
        }, 2000);
    }
    
    createEmergencyMessage(contactName) {
        const time = new Date().toLocaleTimeString();
        const date = new Date().toLocaleDateString();
        
        let displaySpeed = this.currentSpeed;
        let speedUnit = 'km/h';
        
        if (this.settings.speedUnit === 'mph') {
            displaySpeed = this.currentSpeed * 0.621371;
            speedUnit = 'mph';
        }
        
        const locationLink = this.location ? 
            `https://maps.google.com/?q=${this.location.latitude},${this.location.longitude}` :
            'Location unavailable';
        
        return `🚨 EMERGENCY ALERT 🚨

Bike Accident Detected!

👤 User needs immediate assistance
📍 Location: ${locationLink}
🕒 Time: ${time}
📅 Date: ${date}
⚡ Impact Speed: ${Math.round(displaySpeed)} ${speedUnit}
📊 Max Speed Recorded: ${Math.round(this.maxSpeed)} km/h

This is an automated alert from BikeGuard.
If you receive this message, please check on the user immediately.

Latitude: ${this.location?.latitude || 'N/A'}
Longitude: ${this.location?.longitude || 'N/A'}
Accuracy: ${this.location?.accuracy ? Math.round(this.location.accuracy) + ' meters' : 'N/A'}

⚠️ Please take appropriate action!`;
    }
    
    async getCurrentLocation() {
        return new Promise((resolve) => {
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        this.handleLocationUpdate(position);
                        resolve(this.location);
                    },
                    () => {
                        resolve(null);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 5000,
                        maximumAge: 0
                    }
                );
            } else {
                resolve(null);
            }
        });
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
                <span>ACTIVE</span>
            `;
            this.showNotification('Protection Activated', 'BikeGuard is now monitoring for accidents');
            
            // Reset max speed when activating
            this.maxSpeed = 0;
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
    }
    
    saveContact() {
        const name = document.getElementById('contact-name').value.trim();
        const phone = document.getElementById('contact-phone').value.trim();
        
        if (!name || !phone) {
            this.showNotification('Please fill all fields', 'Name and phone number are required');
            return;
        }
        
        const contact = {
            id: Date.now(),
            name: name,
            phone: phone
        };
        
        this.contacts.push(contact);
        this.saveContacts();
        this.renderContacts();
        this.hideContactModal();
        
        this.showNotification('Contact saved', `${name} added to emergency contacts`);
    }
    
    deleteContact(id) {
        this.contacts = this.contacts.filter(contact => contact.id !== id);
        this.saveContacts();
        this.renderContacts();
    }
    
    renderContacts() {
        const contactsList = document.getElementById('contacts-list');
        
        if (this.contacts.length === 0) {
            contactsList.innerHTML = `
                <div class="empty-contacts">
                    <i class="fas fa-user-plus"></i>
                    <p>No contacts added yet</p>
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
    }
    
    updateBatteryStatus(battery) {
        const batteryElem = document.getElementById('battery-status');
        const level = Math.round(battery.level * 100);
        
        batteryElem.textContent = `Battery: ${level}%`;
        
        if (battery.charging) {
            batteryElem.innerHTML += ' 🔌';
        } else if (level < 20) {
            batteryElem.innerHTML += ' ⚠️';
        }
    }
    
    showNotification(title, message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚲</text></svg>'
            });
        }
        
        // Also show in-page toast
        this.showToast(message);
    }
    
    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--primary);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10000;
            animation: slideInRight 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => toast.remove(), 300);
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
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.contacts = data.contacts || [];
                this.settings = {...this.settings, ...data.settings};
                this.threshold = data.threshold || 3.5;
                this.countdownTime = data.countdownTime || 10;
                
                // Update UI
                document.getElementById('threshold').value = this.threshold;
                document.getElementById('threshold-display').textContent = `${this.threshold}g`;
                document.getElementById('threshold-value').textContent = `${this.threshold}g`;
                document.getElementById('countdown-time').value = this.countdownTime;
                document.getElementById('enable-sound').checked = this.settings.enableSound;
                document.getElementById('enable-vibration').checked = this.settings.enableVibration;
                document.getElementById('speed-unit').value = this.settings.speedUnit;
                
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
    
    // Clean up on page unload
    destroy() {
        if (this.speedUpdateInterval) {
            clearInterval(this.speedUpdateInterval);
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.bikeGuard = new BikeAccidentDetector();
    
    // Add CSS for toast animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    // Service Worker registration for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(error => {
                console.log('Service Worker registration failed:', error);
            });
        });
    }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (window.bikeGuard) {
        window.bikeGuard.destroy();
    }
});
