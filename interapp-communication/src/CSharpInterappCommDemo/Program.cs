using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Forms;
using Openfin.Desktop;

namespace InterAppCommDemo
{

    static class Program 
    {
        /// <summary>
        /// The main entry point for the application.
        /// </summary>
        [STAThread]
        static void Main()
        {
            System.Windows.Forms.Application.EnableVisualStyles();
            System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);
            System.Windows.Forms.Application.Run(new Form1());
        } 

    }
}
