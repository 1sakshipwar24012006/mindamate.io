const API_URL = "http://localhost:5000/api/auth";


// ================= REGISTER FUNCTION =================

async function registerUser(userData) {

    try {

        const response = await fetch(`${API_URL}/register`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(userData)

        });

        const data = await response.json();

        console.log("REGISTER DATA:", data);

        if (response.ok && data.success) {

            alert("Registration Successful");

        } else {

            alert(data.message || "Registration Failed");
        }

    } catch (error) {

        console.error("REGISTER ERROR:", error);

        alert("Server Error During Registration");
    }
}



// ================= LOGIN FUNCTION =================

async function loginUser(loginData) {

    try {

        const response = await fetch(`${API_URL}/login`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(loginData)

        });

        console.log("RAW RESPONSE:", response);

        const data = await response.json();

        console.log("LOGIN DATA:", data);

        if (response.ok && data.success) {

            alert("Login Successful");

            // Hide Login Section
            document.getElementById("loginSection").style.display = "none";

            // Show Student Dashboard
            document.getElementById("studentDashboard").style.display = "block";

        } else {

            alert(data.message || "Login Failed");
        }

    } catch (error) {

        console.error("LOGIN ERROR:", error);

        alert("Server Error");
    }
}