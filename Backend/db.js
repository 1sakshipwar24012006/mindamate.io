const oracledb = require("oracledb");

oracledb.initOracleClient({
    libDir: "C:\\oraclexe\\instantclient\\instantclient_19_30"
});

async function connectDB() {

    try {

        const connection = await oracledb.getConnection({

            user: process.env.DB_USER,

            password: process.env.DB_PASSWORD,

            connectString: process.env.DB_CONNECT_STRING

        });

        console.log("Oracle Database Connected");

        return connection;

    } catch (err) {

        console.error(err);

    }
}

module.exports = connectDB;