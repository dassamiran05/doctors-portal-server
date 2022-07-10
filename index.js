const express = require('express')
const cors = require('cors');
const {
  MongoClient,
  ServerApiVersion
} = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

//Midddleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.t4diz.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1
});

async function run() {
  try {
    await client.connect();
    const servicesCollection = client.db('doctors_portal').collection('services');
    const bookingCollection = client.db('doctors_portal').collection('bookings');


    /** 
     * API Naming Convention
     * app.get('/booking')  get all booking in this collection
     * app.get('/booking/:id')// add a specific booking
     * app.post('/booking') // add new booking
     * app.patch('/booking/:id') //update a specific booking 
     * app.delete('/booking/:id') //delete a specific booking 
     *  
     */


    
    app.get('/booking', async(req, res) =>{
      const patient = req.query.patient;
      const query = {patient: patient};
      const bookings = await bookingCollection.find(query).toArray();
      res.send(bookings);
    })


    // Post booking to database
    app.post('/booking', async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient
      };
      // console.log(query.date);
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({
          success: false,
          booking: exists
        });
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({
        success: true,
        result
      });
    })

    // Get all the services
    app.get('/service', async (req, res) => {
      const query = {};
      const cursor = servicesCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    })

    

    // Get the available slots for a perticular Service
    app.get('/available', async(req, res) => {

      const date = req.query.date;
      
      // console.log(date);

      // Step 1: Get all the sevices
      const services = await servicesCollection.find().toArray();

      // Step 2: Get all the bookings of the day
      const query = {date: date}; 
      const bookings = await bookingCollection.find(query).toArray();

      //Step 3: For each service 
      services.forEach(service => {
          // Step 4: find bookings for that service
          const serviceBooking = bookings.filter(book => book.treatment === service.name);
          // Step 5: select slots for tha service Bookings ['', '', '']
          const booked = serviceBooking.map(book => book.slot);
          // Step 6: Select those slots that are not in booked slots
          const available = service.slots.filter(slot => !booked.includes(slot));
          // Step 7: Set available to slots to make it earier
          service.slots = available;
      })
      
      
      res.send(services);
    })

  } finally {

  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Doctors portal Server Running')
})

app.listen(port, () => {
  console.log(`Doctors app listening on port ${port}`)
})